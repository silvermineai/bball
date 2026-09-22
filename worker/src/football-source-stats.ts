import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { footballDb } from "./football-db";

const DATASETS = ["box", "passing", "rushing", "receiving", "defense", "specialists", "team_advanced", "teams", "betting", "ncaa_player_stats", "rosters", "recruits", "team_talent", "returning_production"] as const;
type Dataset = (typeof DATASETS)[number];

const querySchema = z.object({
  dataset: z.enum(["all", ...DATASETS]).default("box"),
  season: z.coerce.number().int().min(2010).max(2035).default(2025),
  division: z.enum(["all", "fbs", "fcs", "d2", "d3", "naia", "unknown"]).default("all"),
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
        rosters: "Season rosters",
        recruits: "Recruiting commitments",
        team_talent: "Team talent",
        returning_production: "Returning production",
      } satisfies Record<Dataset, string>,
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      // Counting the 4 GB football_stats table can exceed the edge read
      // window. Keep the catalog usable from the tiny receipt table even when
      // exact aggregate row counts are temporarily unavailable; the row
      // browser still returns authoritative counts for the selected slice.
      try {
        const [seasons, datasets] = await withTimeout(Promise.all([
          db.prepare("SELECT DISTINCT season FROM football_sources ORDER BY season DESC").all<{ season: number }>(),
          db.prepare("SELECT DISTINCT dataset FROM football_sources WHERE dataset IN (" + DATASETS.map(() => "?").join(",") + ") ORDER BY dataset").bind(...DATASETS).all<{ dataset: Dataset }>(),
        ]), DB_TIMEOUT_MS);
        const response = c.json({
          seasons: seasons.results.map((row) => row.season),
          datasets: datasets.results.map((row) => ({ dataset: row.dataset, rows: null })),
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
            rosters: "Season rosters",
            recruits: "Recruiting commitments",
            team_talent: "Team talent",
            returning_production: "Returning production",
          } satisfies Record<Dataset, string>,
          counts_deferred: true,
        });
        response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
        if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
        return response;
      } catch {
        return c.json({ error: "The football source catalog is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
      }
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
  if (q.division !== "all") {
    // Division is sourced only from the retained season/team directory. A
    // missing or unrecognised directory value remains an explicit `unknown`
    // cohort; no division is inferred from a team name or source category.
    const divisionScope = `EXISTS (
      SELECT 1 FROM football_stats team_scope
       WHERE team_scope.dataset='teams'
         AND team_scope.season=s.season
         AND team_scope.team_id=s.team_id
         AND lower(trim(COALESCE(json_extract(team_scope.stats_json,'$.division'),'')))=?
    )`;
    if (q.division === "unknown") {
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM football_stats team_scope
         WHERE team_scope.dataset='teams'
           AND team_scope.season=s.season
           AND team_scope.team_id=s.team_id
           AND lower(trim(COALESCE(json_extract(team_scope.stats_json,'$.division'),''))) IN ('fbs','fcs','d2','d3','naia')
      )`);
    } else {
      conditions.push(divisionScope);
      binds.push(q.division);
    }
  }
  if (q.game) {
    conditions.push("s.game_id=?");
    binds.push(q.game);
  }
  if (q.q) {
    // instr keeps searches literal: '%' and '_' are ordinary characters.
    // Schedule names and IDs are retained alongside the raw source payload;
    // include them here so a search for a visible game context can locate the
    // same row in the archive.  COALESCE keeps season/team aggregate rows
    // searchable when no schedule record exists.
    conditions.push("instr(lower(s.stats_json || ' ' || COALESCE(s.team_id,'') || ' ' || COALESCE(s.athlete_id,'') || ' ' || COALESCE(s.category,'') || ' ' || COALESCE(s.record_key,'') || ' ' || COALESCE(s.game_id,'') || ' ' || COALESCE(g.home_name,'') || ' ' || COALESCE(g.away_name,'')),lower(?))>0");
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
      db.prepare(`SELECT count(*) AS total
        FROM football_stats s LEFT JOIN football_games g ON g.id=s.game_id
        WHERE ${where}`)
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
  // Keep provider URLs in the private receipt table only. The public source
  // browser needs the edition clock and digest to audit a row, but should not
  // turn the API into an outbound source directory.
  const sourceReceipts = receipts.results.flatMap((row) => {
    try {
      const receipt = JSON.parse(row.receipt_json) as { url?: string; fetched_at?: string; sha256?: string };
      if (!receipt.url || !receipt.fetched_at || !receipt.sha256) return [];
      return [{ dataset: row.dataset, season: row.season, fetched_at: receipt.fetched_at, sha256: receipt.sha256 }];
    } catch {
      return [];
    }
  });
  const parsedRows = rows.results.flatMap(({ stats_json, ...row }) => {
    try {
      const stats = JSON.parse(stats_json) as unknown;
      // A source record is useful to the browser only when its retained
      // payload is an object.  Failing closed here also keeps the field
      // catalog from presenting array indexes or scalar values as fields.
      if (!stats || typeof stats !== "object" || Array.isArray(stats)) return [];
      return [{
        ...row,
        stats: stats as Record<string, unknown>,
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
  });
  const fieldCounts = new Map<string, number>();
  for (const row of parsedRows) {
    for (const key of Object.keys(row.stats)) fieldCounts.set(key, (fieldCounts.get(key) || 0) + 1);
  }
  const fieldCatalog = [...fieldCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, observedRows]) => ({
      key,
      observed_rows: observedRows,
      share: parsedRows.length ? observedRows / parsedRows.length : null,
    }));
  const response = c.json({
    dataset: q.dataset,
    season: q.season,
    page: q.page,
    page_size: 40,
    total: count?.total ?? 0,
    // This is deliberately scoped to the returned page.  It is a discovery
    // aid for heterogeneous source releases, not a claim that a field exists
    // on every row in the retained archive.
    field_catalog: fieldCatalog,
    field_catalog_scope: "returned_page",
    source_receipts: sourceReceipts,
    filters: { q: q.q, team: q.team ?? null, game: q.game ?? null, division: q.division },
    rows: parsedRows,
  });
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
});
