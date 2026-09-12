import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { researchDb } from "./research-db";

type Bindings = Env;
const querySchema = z.object({
  season: z.coerce.number().int().min(2022).max(2035).default(2027),
  q: z.string().trim().max(120).optional(),
  confirmed: z.enum(["0", "1"]).default("0"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(40),
  meta: z.enum(["0", "1"]).default("0"),
});

export const scheduleTimes = new Hono<{ Bindings: Bindings }>();
const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("schedule clock query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function cacheFor() {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

const LATEST = `
  WITH ranked AS (
    SELECT t.*, ROW_NUMBER() OVER (
      PARTITION BY t.sport,t.game_id ORDER BY t.observed_at DESC,t.id DESC
    ) AS row_number
    FROM audit_schedule_times t
    WHERE t.sport='basketball'
  )
`;

scheduleTimes.get("/", zValidator("query", querySchema), async (c) => {
  const { season, q, confirmed, page, limit, meta } = c.req.valid("query");
  const db = researchDb(c.env);
  const cache = cacheFor();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache failure must not hide the read-only evidence endpoint.
    }
  }
  const search = q ? `%${q}%` : null;
  const filter = search
    ? "g.season=? AND (g.home_name LIKE ? OR g.away_name LIKE ?)"
    : "g.season=?";
  const binds: Array<string | number> = search ? [season, search, search] : [season];
  const confirmedClause = confirmed === "1" ? " AND ranked.source_time_valid=1" : "";
  try {
    if (meta === "1") {
      const result = await withTimeout(db.prepare(`${LATEST}
        SELECT count(*) AS total,
          sum(CASE WHEN ranked.source_time_valid=1 THEN 1 ELSE 0 END) AS confirmed,
          max(ranked.observed_at) AS latest_observed_at
        FROM ranked JOIN bb_games g ON g.id=ranked.game_id
        WHERE ranked.row_number=1 AND ${filter}`
      ).bind(...binds).first<{ total: number; confirmed: number | null; latest_observed_at: string | null }>(), DB_TIMEOUT_MS);
      const response = c.json({
        season,
        total: Number(result?.total || 0),
        confirmed: Number(result?.confirmed || 0),
        latest_observed_at: result?.latest_observed_at || null,
        provider: "ESPN Scoreboard",
        policy: "Exact ESPN event and participant IDs are required. Source timeValid is shown as an observation and never rewrites the canonical schedule or forecast registration.",
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    }
    const count = await withTimeout(db.prepare(`${LATEST}
      SELECT count(*) AS total FROM ranked JOIN bb_games g ON g.id=ranked.game_id
      WHERE ranked.row_number=1 AND ${filter}${confirmedClause}`
    ).bind(...binds).first<{ total: number }>(), DB_TIMEOUT_MS);
    const rows = await withTimeout(db.prepare(`${LATEST}
      SELECT ranked.game_id,g.season,g.home_name,g.away_name,g.starts_at AS canonical_start,
        g.time_tbd AS canonical_time_tbd,ranked.source_start,ranked.source_time_valid,
        ranked.observed_at,ranked.provider,ranked.payload_json
      FROM ranked JOIN bb_games g ON g.id=ranked.game_id
      WHERE ranked.row_number=1 AND ${filter}${confirmedClause}
      ORDER BY ranked.source_start ASC,ranked.game_id ASC LIMIT ? OFFSET ?`
    ).bind(...binds, limit, page * limit).all(), DB_TIMEOUT_MS);
    const output = rows.results.map((row) => {
      const value = row as Record<string, unknown>;
      let payload: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(String(value.payload_json || "{}"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
      } catch {
        // A malformed payload remains an unavailable source URL, not a 500.
      }
      delete value.payload_json;
      return { ...value, source_time_valid: value.source_time_valid === 1, source_url: payload.source_url || null };
    });
    const response = c.json({ season, confirmed: confirmed === "1", page, page_size: limit, total: Number(count?.total || 0), rows: output });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ season, confirmed: confirmed === "1", page, page_size: limit, total: 0, rows: [], source: "unavailable", unavailable_reason: "The schedule clock warehouse did not respond within the read window." }, 200, { "Cache-Control": "no-store" });
  }
});
