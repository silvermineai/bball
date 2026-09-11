import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { footballDb } from "./football-db";

const DATASETS = ["box", "passing", "rushing", "receiving", "defense", "specialists", "team_advanced", "teams", "betting", "ncaa_player_stats"] as const;
type Dataset = (typeof DATASETS)[number];

const querySchema = z.object({
  dataset: z.enum(["all", ...DATASETS]).default("box"),
  season: z.coerce.number().int().min(2010).max(2035).default(2025),
  q: z.string().trim().max(100).default(""),
  team: z.string().regex(/^\d{1,15}$/).optional(),
  game: z.string().regex(/^\d{1,15}$/).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

export const footballSourceStats = new Hono<{ Bindings: Env }>();

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("football source statistics query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

footballSourceStats.get("/", zValidator("query", querySchema), async (c) => {
  const q = c.req.valid("query");
  const db = footballDb(c.env);
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the source browser fail.
    }
  }
  if (q.meta === "1") {
    try {
      const [seasons, datasets] = await withTimeout(Promise.all([
        db.prepare("SELECT DISTINCT season FROM football_stats ORDER BY season DESC").all<{ season: number }>(),
        db.prepare("SELECT dataset,count(*) AS rows FROM football_stats GROUP BY dataset ORDER BY dataset").all<{ dataset: Dataset; rows: number }>(),
      ]), DB_TIMEOUT_MS);
      const response = c.json({
        seasons: seasons.results.map((row) => row.season),
        datasets: datasets.results,
        dataset_labels: {
          box: "Player box scores",
          passing: "Passing aggregates",
          rushing: "Rushing aggregates",
          receiving: "Receiving aggregates",
          defense: "Defensive events",
          specialists: "Kicking, punting & returns",
          team_advanced: "Advanced team rates",
          teams: "Team directory",
          betting: "Historical market archive",
          ncaa_player_stats: "NCAA-derived player game stats",
        } satisfies Record<Dataset, string>,
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      return c.json({ error: "The football source catalog is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
  }
  const conditions = ["s.season=?"];
  const binds: Array<string | number> = [q.season];
  if (q.dataset !== "all") {
    conditions.push("s.dataset=?");
    binds.push(q.dataset);
  }
  if (q.team) {
    conditions.push("s.team_id=?");
    binds.push(q.team);
  }
  if (q.game) {
    conditions.push("s.game_id=?");
    binds.push(q.game);
  }
  if (q.q) {
    // instr keeps searches literal: '%' and '_' are ordinary characters.
    conditions.push("instr(lower(s.stats_json || ' ' || COALESCE(s.team_id,'') || ' ' || COALESCE(s.athlete_id,'') || ' ' || COALESCE(s.category,'')),lower(?))>0");
    binds.push(q.q);
  }
  const where = conditions.join(" AND ");
  let count: { total: number } | null;
  let rows: { results: Array<{
    dataset: Dataset;
    season: number;
    record_key: string;
    athlete_id: string | null;
    team_id: string | null;
    game_id: string | null;
    category: string | null;
    stats_json: string;
    kickoff: string | null;
    home_name: string | null;
    away_name: string | null;
    home_score: number | null;
    away_score: number | null;
  }> };
  let receipts: { results: Array<{ dataset: Dataset; season: number; receipt_json: string }> };
  try {
    [count, rows, receipts] = await withTimeout(Promise.all([
      db.prepare(`SELECT count(*) AS total FROM football_stats s WHERE ${where}`)
        .bind(...binds)
        .first<{ total: number }>(),
      db.prepare(`SELECT s.dataset,s.season,s.record_key,s.athlete_id,s.team_id,s.game_id,s.category,s.stats_json,
        g.kickoff,g.home_name,g.away_name,g.home_score,g.away_score
        FROM football_stats s LEFT JOIN football_games g ON g.id=s.game_id
        WHERE ${where}
        ORDER BY g.kickoff IS NULL,g.kickoff DESC,s.dataset ASC,s.record_key ASC
        LIMIT 40 OFFSET ?`)
        .bind(...binds, q.page * 40)
        .all<{
          dataset: Dataset;
          season: number;
          record_key: string;
          athlete_id: string | null;
          team_id: string | null;
          game_id: string | null;
          category: string | null;
          stats_json: string;
          kickoff: string | null;
          home_name: string | null;
          away_name: string | null;
          home_score: number | null;
          away_score: number | null;
        }>(),
      db.prepare(`SELECT dataset,season,receipt_json FROM football_sources WHERE season=?${q.dataset === "all" ? "" : " AND dataset=?"} ORDER BY dataset`)
        .bind(...(q.dataset === "all" ? [q.season] : [q.season, q.dataset]))
        .all<{ dataset: Dataset; season: number; receipt_json: string }>(),
    ]), DB_TIMEOUT_MS);
  } catch {
    return c.json({ error: "The football source archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
  const sourceReceipts = receipts.results.flatMap((row) => {
    try {
      const receipt = JSON.parse(row.receipt_json) as { url?: string; fetched_at?: string; sha256?: string };
      if (!receipt.url || !receipt.fetched_at || !receipt.sha256) return [];
      return [{ dataset: row.dataset, season: row.season, url: receipt.url, fetched_at: receipt.fetched_at, sha256: receipt.sha256 }];
    } catch {
      return [];
    }
  });
  const response = c.json({
    dataset: q.dataset,
    season: q.season,
    page: q.page,
    page_size: 40,
    total: count?.total ?? 0,
    source_receipts: sourceReceipts,
    filters: { q: q.q, team: q.team ?? null, game: q.game ?? null },
    rows: rows.results.flatMap(({ stats_json, ...row }) => {
      try {
        return [{
          ...row,
          stats: JSON.parse(stats_json) as Record<string, unknown>,
          game: row.game_id && row.kickoff ? {
            id: row.game_id,
            kickoff: row.kickoff,
            home_name: row.home_name,
            away_name: row.away_name,
            home_score: row.home_score,
            away_score: row.away_score,
          } : null,
        }];
      } catch {
        return [];
      }
    }),
  });
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
});
