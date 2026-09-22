import { researchDb } from "./research-db";
import { publicReceipt } from "./public-receipts";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
type Metric = {
  key: string;
  label: string;
  unit: "points per 100 possessions" | "possessions per 40 minutes" | "rank" | "minutes";
  description: string;
};
const ratingMetrics: Metric[] = [
  { key: "rank", label: "Publisher rank", unit: "rank", description: "Recorded overall rank in the selected team-season release." },
  { key: "adj_em", label: "Adjusted efficiency margin", unit: "points per 100 possessions", description: "Adjusted offense minus adjusted defense; positive values indicate stronger expected scoring margin on a neutral floor." },
  { key: "adj_o", label: "Adjusted offense", unit: "points per 100 possessions", description: "Opponent-adjusted points expected per 100 possessions on offense." },
  { key: "adj_d", label: "Adjusted defense", unit: "points per 100 possessions", description: "Opponent-adjusted points allowed per 100 possessions; lower values are better." },
  { key: "adj_tempo", label: "Adjusted tempo", unit: "possessions per 40 minutes", description: "Opponent-adjusted estimated possessions per 40 minutes." },
];
const playerMetrics: Metric[] = [
  // BPM is a rate, not an untyped score. Keeping the unit in the public
  // catalog prevents the archive UI and CSV export from presenting these
  // source-attributed player values as arbitrary numbers.
  { key: "box_bpm", label: "Box Plus/Minus", unit: "points per 100 possessions", description: "Source-attributed estimate of overall player value per 100 possessions from box-score production." },
  { key: "box_obpm", label: "Offensive BPM", unit: "points per 100 possessions", description: "Source-attributed box-score estimate of offensive player value per 100 possessions." },
  { key: "box_dbpm", label: "Defensive BPM", unit: "points per 100 possessions", description: "Source-attributed box-score estimate of defensive player value per 100 possessions." },
  { key: "min", label: "Recorded minutes", unit: "minutes", description: "Minutes recorded for the player in the selected season." },
];
const querySchema = z.object({
  kind: z.enum(["ratings", "players"]).default("ratings"),
  season: z.coerce.number().int().min(2006).max(2026).default(2026),
  metric: z.string().regex(/^[a-z_]{2,20}$/).optional(),
  q: z.string().trim().max(120).optional(),
  // Exact source team IDs allow matchup cards to hydrate a compact comparison
  // set without relying on a fuzzy program-name search.
  ids: z.string().trim().max(2400).regex(/^\d+(,\d+){0,399}$/).optional(),
  playerId: z.string().regex(/^\d{1,15}$/).optional(),
  page: z.coerce.number().int().min(0).max(250).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(40),
  direction: z.enum(["desc", "asc"]).default("desc"),
  meta: z.enum(["0", "1"]).default("0"),
});

export const boutique = new Hono<{ Bindings: Bindings }>();
const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("boutique model archive query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined"
    ? null
    : (caches as unknown as { default: Cache }).default;
}

boutique.get("/", zValidator("query", querySchema), async (c) => {
  const { kind, season, metric: requestedMetric, q, ids, playerId, page, limit, direction, meta } = c.req.valid("query");
  if (playerId && kind !== "players") return c.json({ error: "playerId is only valid for player value rows" }, 400);
  if (ids && kind !== "ratings") return c.json({ error: "ids is only valid for team rating rows" }, 400);
  const metrics = kind === "ratings" ? ratingMetrics : playerMetrics;
  const db = researchDb(c.env);
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the model archive fail.
    }
  }
  if (meta === "1") {
    const dataset = kind === "ratings" ? "publisher_ratings" : "publisher_player_value";
    try {
      const [seasons, sources] = await withTimeout(db.batch([
        db.prepare(`SELECT DISTINCT season FROM ${kind === "ratings" ? "bb_publisher_ratings" : "bb_player_value"} ORDER BY season DESC`),
        db.prepare("SELECT season,receipt_json FROM bb_sources WHERE dataset=? ORDER BY season DESC").bind(dataset),
      ]), DB_TIMEOUT_MS);
      const sourceReceipts = sources.results.flatMap((row) => {
        const item = row as { season?: number; receipt_json?: string };
        if (typeof item.season !== "number" || typeof item.receipt_json !== "string") return [];
        try {
          const receipt = JSON.parse(item.receipt_json) as { url?: unknown; fetched_at?: unknown; sha256?: unknown };
          if (typeof receipt.url !== "string" || typeof receipt.fetched_at !== "string" || typeof receipt.sha256 !== "string") return [];
          return [publicReceipt({ season: item.season, url: receipt.url, fetched_at: receipt.fetched_at, sha256: receipt.sha256 })];
        } catch {
          return [];
        }
      });
      const response = c.json({ kind, seasons: seasons.results.map((row) => Number((row as { season: number }).season)), metrics, source_receipts: sourceReceipts });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      return c.json({ error: "The boutique model catalog is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
  }
  const metric = metrics.find((candidate) => candidate.key === (requestedMetric || metrics[0].key));
  if (!metric) return c.json({ error: "Unknown boutique metric" }, 400);
  const sortDirection = !requestedMetric && metric.key === "rank" ? "asc" : direction;
  const table = kind === "ratings" ? "bb_publisher_ratings" : "bb_player_value";
  const path = `$.${metric.key}`;
  const search = q ? `%${q}%` : null;
  const teamIds = ids ? ids.split(",") : [];
  const teamIdClause = teamIds.length ? `p.team_id IN (${teamIds.map(() => "?").join(",")})` : null;
  const where = kind === "ratings"
    ? teamIdClause ? `p.season=? AND ${teamIdClause}` : search ? "p.season=? AND (COALESCE(t.team_name,p.team_id) LIKE ? OR p.team_id LIKE ?)" : "p.season=?"
    : playerId ? "p.season=? AND p.player_id=?"
      : search ? "p.season=? AND (p.player_name LIKE ? OR COALESCE(t.team_name,p.team_id) LIKE ? OR p.player_id LIKE ?)" : "p.season=?";
  const binds: Array<string | number> = teamIds.length
    ? [season, ...teamIds]
    : kind === "players" && playerId
    ? [season, playerId]
    : search
      ? kind === "ratings" ? [season, search, search] : [season, search, search, search]
      : [season];
  try {
    const count: { total: number; non_null: number; ranked_count?: number } | null = kind === "ratings"
      ? await withTimeout(db.prepare(
        `SELECT count(*) AS total,
                count(json_extract(p.stats_json, ?)) AS non_null,
                (SELECT count(json_extract(cohort.stats_json, ?)) FROM bb_publisher_ratings cohort WHERE cohort.season=?) AS ranked_count
           FROM ${table} p
           LEFT JOIN bb_team_season t ON t.season=p.season AND t.team_id=p.team_id
          WHERE ${where}`,
      ).bind(path, path, season, ...binds).first<{ total: number; non_null: number; ranked_count: number }>(), DB_TIMEOUT_MS)
      : await withTimeout(db.prepare(
        `SELECT count(*) AS total, count(json_extract(p.stats_json, ?)) AS non_null FROM ${table} p LEFT JOIN bb_team_season t ON t.season=p.season AND t.team_id=p.team_id WHERE ${where}`,
      ).bind(path, ...binds).first<{ total: number; non_null: number }>(), DB_TIMEOUT_MS);
    const valueOrder = `json_extract(p.stats_json, '${path}') ${sortDirection === "asc" ? "ASC" : "DESC"}`;
    const order = `json_extract(p.stats_json, '${path}') IS NULL, ${valueOrder}, ${kind === "ratings" ? "COALESCE(t.team_name,p.team_id),p.team_id" : "p.player_name,p.player_id"}`;
    const rows = kind === "ratings"
      ? await withTimeout(db.prepare(
        `WITH metric_values AS (
           SELECT p.team_id AS id,
                  COALESCE(t.team_name,p.team_id) AS team,
                  t.team_abbreviation AS abbreviation,
                  json_extract(p.stats_json, '${path}') AS value,
                  json_extract(p.stats_json, '$.rank') AS publisher_rank
             FROM bb_publisher_ratings p
             LEFT JOIN bb_team_season t ON t.season=p.season AND t.team_id=p.team_id
            WHERE p.season=?
         ), ranked AS (
           SELECT *,
                  CASE WHEN value IS NULL THEN NULL ELSE RANK() OVER (ORDER BY value IS NULL, value ${sortDirection === "asc" ? "ASC" : "DESC"}) END AS metric_rank,
                  COUNT(value) OVER () AS ranked_count
             FROM metric_values
         )
         SELECT * FROM ranked
          ${teamIds.length ? `WHERE id IN (${teamIds.map(() => "?").join(",")})` : search ? "WHERE team LIKE ? OR id LIKE ?" : ""}
          ORDER BY value IS NULL, value ${sortDirection === "asc" ? "ASC" : "DESC"}, team, id
          LIMIT ? OFFSET ?`,
      ).bind(...(teamIds.length ? [season, ...teamIds] : search ? [season, search, search] : [season]), limit, page * limit).all(), DB_TIMEOUT_MS)
      : await withTimeout(db.prepare(
        `SELECT p.player_id AS id, p.player_name AS player, p.team_id, COALESCE(t.team_name,p.team_id) AS team, json_extract(p.stats_json, '$.box_bpm') AS bpm, json_extract(p.stats_json, '${path}') AS value, CASE WHEN json_extract(p.stats_json, '${path}') IS NULL THEN NULL ELSE RANK() OVER (ORDER BY json_extract(p.stats_json, '${path}') IS NULL, ${valueOrder}) END AS rank, COUNT(json_extract(p.stats_json, '${path}')) OVER () AS ranked_count FROM ${table} p LEFT JOIN bb_team_season t ON t.season=p.season AND t.team_id=p.team_id WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ).bind(...binds, limit, page * limit).all(), DB_TIMEOUT_MS);
    const response = c.json({
      kind,
      season,
      metric,
      page,
      page_size: limit,
      total: count?.total ?? 0,
      non_null: count?.non_null ?? 0,
      ranking: {
        direction: sortDirection,
        population: kind === "ratings"
          ? "all team rows in the selected season with a recorded metric value"
          : "filtered rows with a recorded metric value",
        ranked_count: kind === "ratings"
          ? Number(count?.ranked_count || 0)
          : count?.non_null ?? 0,
      },
      rows: rows.results,
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The boutique model archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
