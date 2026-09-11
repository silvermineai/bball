import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { researchDb } from "./research-db";

type Bindings = Env;

const querySchema = z.object({
  season: z.coerce.number().int().min(2026).max(2026).default(2026),
  q: z.string().trim().max(120).optional(),
  espnId: z.string().trim().regex(/^\d{1,15}$/).optional(),
  provider: z.enum(["all", "fox", "yahoo"]).default("all"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("player crosswalk query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

export const playerCrosswalk = new Hono<{ Bindings: Bindings }>();

/**
 * Browse the publisher-supplied ESPN/Fox/Yahoo identifier crosswalk. The
 * endpoint keeps the provider namespace explicit and returns the source's
 * match confidence without presenting it as an NCAA identity join.
 */
playerCrosswalk.get("/", zValidator("query", querySchema), async (c) => {
  const { season, q, espnId, provider, page, meta } = c.req.valid("query");
  const db = researchDb(c.env);
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the identity browser fail.
    }
  }
  if (meta === "1") {
    try {
      const [seasons, counts, source] = await withTimeout(db.batch([
        db.prepare("SELECT DISTINCT season FROM bb_player_crosswalk ORDER BY season DESC"),
        db.prepare(
          "SELECT COUNT(*) AS rows, COUNT(DISTINCT espn_athlete_id) AS players, " +
          "COUNT(fox_athlete_id) AS fox_ids, COUNT(yahoo_player_id) AS yahoo_ids " +
          "FROM bb_player_crosswalk WHERE season=?",
        ).bind(season),
        db.prepare(
          "SELECT json_extract(receipt_json,'$.url') AS url, " +
          "json_extract(receipt_json,'$.fetched_at') AS fetched_at, " +
          "json_extract(receipt_json,'$.sha256') AS sha256 " +
          "FROM bb_sources WHERE dataset='player_crosswalk' AND season=?",
        ).bind(season),
      ]), DB_TIMEOUT_MS);
    const count = counts.results[0] as { rows?: number; players?: number; fox_ids?: number; yahoo_ids?: number } | undefined;
    const receipt = source.results[0] as { url?: unknown; fetched_at?: unknown; sha256?: unknown } | undefined;
      const response = c.json({
      seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
      season,
      rows: Number(count?.rows || 0),
      players: Number(count?.players || 0),
      fox_ids: Number(count?.fox_ids || 0),
      yahoo_ids: Number(count?.yahoo_ids || 0),
      source: {
        url: typeof receipt?.url === "string" ? receipt.url : null,
        fetched_at: typeof receipt?.fetched_at === "string" ? receipt.fetched_at : null,
        sha256: typeof receipt?.sha256 === "string" ? receipt.sha256 : null,
      },
      identity_note: "Source-published ESPN/Fox/Yahoo identifiers with match method and confidence retained. No NCAA ID join is asserted.",
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      return c.json({ error: "The player crosswalk catalog is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
  }

  const clauses = ["season=?"];
  const binds: Array<string | number> = [season];
  if (q) {
    clauses.push("(player_name LIKE ? OR espn_full_name LIKE ? OR fox_player LIKE ? OR yahoo_player_name LIKE ? OR espn_athlete_id LIKE ? OR fox_athlete_id LIKE ? OR yahoo_player_id LIKE ? OR team_abbreviation LIKE ?)");
    const search = `%${q}%`;
    binds.push(search, search, search, search, search, search, search, search);
  }
  if (espnId) {
    clauses.push("espn_athlete_id=?");
    binds.push(espnId);
  }
  if (provider === "fox") clauses.push("fox_athlete_id IS NOT NULL AND fox_athlete_id != ''");
  if (provider === "yahoo") clauses.push("yahoo_player_id IS NOT NULL AND yahoo_player_id != ''");
  const where = clauses.join(" AND ");
  try {
  const count = await withTimeout(db.prepare(`SELECT COUNT(*) AS total FROM bb_player_crosswalk WHERE ${where}`).bind(...binds).first<{ total: number }>(), DB_TIMEOUT_MS);
  const rows = await withTimeout(db.prepare(
    `SELECT season,espn_team_id,team_abbreviation,player_name,espn_athlete_id,
      espn_full_name,espn_jersey,espn_position,fox_athlete_id,fox_player,
      fox_jersey,fox_position_group,yahoo_player_id,yahoo_player_name,
      match_method,match_confidence,match_keys
     FROM bb_player_crosswalk WHERE ${where}
     ORDER BY player_name ASC, espn_athlete_id ASC
     LIMIT 40 OFFSET ?`,
  ).bind(...binds, page * 40).all(), DB_TIMEOUT_MS);
  const response = c.json({
    season,
    provider,
    page,
    page_size: 40,
    total: Number(count?.total || 0),
    rows: rows.results.map((row) => ({
      ...row,
      season: Number((row as { season: unknown }).season),
      match_confidence: (row as { match_confidence: unknown }).match_confidence == null ? null : Number((row as { match_confidence: unknown }).match_confidence),
    })),
  });
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
  } catch {
    return c.json({ error: "The player crosswalk archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
