import { researchDb } from "./research-db";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const querySchema = z.object({
  season: z.union([z.coerce.number().int().min(2003).max(2026), z.literal("all")]).default(2026),
  q: z.string().trim().max(120).optional(),
  position: z.string().trim().regex(/^[A-Za-z0-9 -]{0,40}$/).optional(),
  status: z.string().trim().regex(/^[A-Za-z0-9 _-]{0,40}$/).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  direction: z.enum(["asc", "desc"]).default("asc"),
  meta: z.enum(["0", "1"]).default("0"),
});

export const playerCore = new Hono<{ Bindings: Bindings }>();

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("ESPN profile archive query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined"
    ? null
    : (caches as unknown as { default: Cache }).default;
}

function parseProfile(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

playerCore.get("/", zValidator("query", querySchema), async (c) => {
  const { season, q, position, status, page, direction, meta } = c.req.valid("query");
  const db = researchDb(c.env);
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the profile archive fail.
    }
  }
  if (meta === "1") {
    try {
      const [seasons, positions, statuses, count, source] = await withTimeout(db.batch([
        db.prepare("SELECT DISTINCT season FROM bb_player_core ORDER BY season DESC"),
        db.prepare("SELECT DISTINCT json_extract(profile_json,'$.position_name') AS value FROM bb_player_core WHERE season=? AND value IS NOT NULL AND value != '' ORDER BY value").bind(typeof season === "number" ? season : 2026),
        db.prepare("SELECT DISTINCT json_extract(profile_json,'$.status_name') AS value FROM bb_player_core WHERE season=? AND value IS NOT NULL AND value != '' ORDER BY value").bind(typeof season === "number" ? season : 2026),
        db.prepare("SELECT count(*) AS total FROM bb_player_core WHERE season=?").bind(typeof season === "number" ? season : 2026),
        db.prepare("SELECT json_extract(receipt_json,'$.fetched_at') AS fetched_at, json_extract(receipt_json,'$.sha256') AS sha256 FROM bb_sources WHERE dataset='player_core' AND season=?").bind(typeof season === "number" ? season : 2026),
      ]), DB_TIMEOUT_MS);
      const sourceRow = source.results[0] as { fetched_at?: unknown; sha256?: unknown } | undefined;
      const response = c.json({
        seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
        positions: positions.results.map((row) => String((row as { value: string }).value)),
        statuses: statuses.results.map((row) => String((row as { value: string }).value)),
        total: Number((count.results[0] as { total: number }).total || 0),
        source: {
          fetched_at: typeof sourceRow?.fetched_at === "string" ? sourceRow.fetched_at : null,
          sha256: typeof sourceRow?.sha256 === "string" ? sourceRow.sha256 : null,
        },
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      return c.json({ error: "The ESPN profile catalog is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
  }
  const clauses: string[] = [];
  const binds: Array<string | number> = [];
  if (typeof season === "number") {
    clauses.push("season=?");
    binds.push(season);
  }
  if (q) {
    clauses.push("(json_extract(profile_json,'$.display_name') LIKE ? OR json_extract(profile_json,'$.full_name') LIKE ? OR json_extract(profile_json,'$.slug') LIKE ? OR athlete_id LIKE ?)");
    const search = `%${q}%`;
    binds.push(search, search, search, search);
  }
  if (position) {
    clauses.push("json_extract(profile_json,'$.position_name')=?");
    binds.push(position);
  }
  if (status) {
    clauses.push("json_extract(profile_json,'$.status_name')=?");
    binds.push(status);
  }
  const where = clauses.length ? clauses.join(" AND ") : "1=1";
  try {
    const count = await withTimeout(db.prepare(`SELECT count(*) AS total FROM bb_player_core WHERE ${where}`).bind(...binds).first<{ total: number }>(), DB_TIMEOUT_MS);
    const order = direction === "desc" ? "DESC" : "ASC";
    const rowWhere = where
      .replaceAll("season=?", "bb_player_core.season=?")
      .replaceAll("athlete_id LIKE", "bb_player_core.athlete_id LIKE");
    const rows = await withTimeout(db.prepare(
      `SELECT bb_player_core.season,bb_player_core.athlete_id AS id,
      json_extract(bb_player_core.profile_json,'$.display_name') AS name,
      json_extract(bb_player_core.profile_json,'$.position_name') AS position,
      json_extract(bb_player_core.profile_json,'$.display_height') AS height,
      json_extract(bb_player_core.profile_json,'$.display_weight') AS weight,
      json_extract(bb_player_core.profile_json,'$.jersey') AS jersey,
      json_extract(bb_player_core.profile_json,'$.experience_years') AS experience,
      json_extract(bb_player_core.profile_json,'$.status_name') AS status,
      json_extract(bb_player_core.profile_json,'$.current_team_id') AS team_id,
      COALESCE(r.team_name, json_extract(bb_player_core.profile_json,'$.current_team_id')) AS team,
      bb_player_core.profile_json
       FROM bb_player_core
     LEFT JOIN (
       SELECT season,athlete_id,
         MAX(json_extract(profile_json,'$.team_display_name')) AS team_name
       FROM bb_rosters GROUP BY season,athlete_id
     ) r ON r.season=bb_player_core.season AND r.athlete_id=bb_player_core.athlete_id
     WHERE ${rowWhere}
     ORDER BY name ${order}, season DESC, id ASC LIMIT 40 OFFSET ?`,
    ).bind(...binds, page * 40).all(), DB_TIMEOUT_MS);
    const response = c.json({
      season,
      page,
      page_size: 40,
      total: count?.total ?? 0,
      rows: (rows.results as Array<Record<string, unknown>>).flatMap(({ profile_json, ...row }) => {
        const profile = parseProfile(profile_json);
        return profile ? [{ ...row, profile }] : [];
      }),
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The ESPN profile archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
