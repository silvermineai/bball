import { researchDb } from "./research-db";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
const metrics = ["players", "programs", "games", "points", "ppg"] as const;
type Metric = (typeof metrics)[number];
const querySchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026).default(2026),
  metric: z.enum(metrics).default("players"),
  minPlayers: z.coerce.number().int().min(1).max(20).default(1),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

export const ncaaHighSchools = new Hono<{ Bindings: Bindings }>();

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("NCAA high-school archive query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined"
    ? null
    : (caches as unknown as { default: Cache }).default;
}

const metricExpression = (metric: Metric) => ({
  players: "players",
  programs: "programs",
  games: "games",
  points: "points",
  ppg: "CASE WHEN games > 0 THEN points / games ELSE NULL END",
}[metric]);

ncaaHighSchools.get("/", zValidator("query", querySchema), async (c) => {
  const { season, metric, minPlayers, q, page, meta } = c.req.valid("query");
  const db = researchDb(c.env);
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the pipeline endpoint fail.
    }
  }
  if (meta === "1") {
    try {
      const [seasons, schools, source] = await withTimeout(db.batch([
        db.prepare("SELECT DISTINCT season FROM bb_ncaa_rosters ORDER BY season DESC"),
        db.prepare("SELECT count(DISTINCT json_extract(profile_json,'$.high_school')) AS total FROM bb_ncaa_rosters WHERE season=? AND json_extract(profile_json,'$.high_school') IS NOT NULL AND json_extract(profile_json,'$.high_school') != ''").bind(season),
        db.prepare("SELECT json_extract(receipt_json,'$.fetched_at') AS fetched_at, json_extract(receipt_json,'$.sha256') AS sha256 FROM bb_sources WHERE dataset='ncaa_team_rosters' AND season=?").bind(season),
      ]), DB_TIMEOUT_MS);
      const sourceRow = source.results[0] as { fetched_at?: unknown; sha256?: unknown } | undefined;
      const response = c.json({
        seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
        total: Number((schools.results[0] as { total: number }).total || 0),
        metrics,
        source: {
          fetched_at: typeof sourceRow?.fetched_at === "string" ? sourceRow.fetched_at : null,
          sha256: typeof sourceRow?.sha256 === "string" ? sourceRow.sha256 : null,
        },
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      return c.json({ error: "The NCAA high-school catalog is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
  }
  const clauses = ["r.season=?", "json_extract(r.profile_json,'$.high_school') IS NOT NULL", "json_extract(r.profile_json,'$.high_school') != ''"];
  const binds: Array<string | number> = [season];
  if (q) {
    clauses.push("json_extract(r.profile_json,'$.high_school') LIKE ?");
    binds.push(`%${q}%`);
  }
  const where = clauses.join(" AND ");
  const aggregate = `
    SELECT json_extract(r.profile_json,'$.high_school') AS high_school,
      COUNT(DISTINCT r.player_id) AS players,
      COUNT(DISTINCT r.team_id) AS programs,
      SUM(COALESCE(p.games,0)) AS games,
      SUM(COALESCE(p.points,0)) AS points
    FROM bb_ncaa_rosters r
    LEFT JOIN (
      SELECT season,player_id,team_id,
        SUM(games) AS games,
        SUM(COALESCE(CAST(json_extract(stats_json,'$.pts') AS REAL),0)) AS points
      FROM bb_ncaa_player_season GROUP BY season,player_id,team_id
    ) p ON p.season=r.season AND p.player_id=r.player_id AND p.team_id=r.team_id
    WHERE ${where}
    GROUP BY json_extract(r.profile_json,'$.high_school')`;
  const value = metricExpression(metric);
  try {
    const [count, rows] = await Promise.all([
      withTimeout(db.prepare(`SELECT count(*) AS total FROM (${aggregate}) schools WHERE players >= ? AND (${value}) IS NOT NULL`).bind(...binds, minPlayers).first<{ total: number }>(), DB_TIMEOUT_MS),
      withTimeout(db.prepare(`WITH schools AS (${aggregate}), ranked AS (
          SELECT schools.*, ${value} AS value FROM schools WHERE players >= ?
        ) SELECT *, RANK() OVER (ORDER BY value DESC) AS rank FROM ranked
        WHERE value IS NOT NULL ORDER BY value DESC, high_school ASC LIMIT 50 OFFSET ?`).bind(...binds, minPlayers, page * 50).all(), DB_TIMEOUT_MS),
    ]);
    const response = c.json({ season, metric, min_players: minPlayers, page, page_size: 50, total: Number(count?.total || 0), rows: rows.results });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The NCAA high-school pipeline is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
