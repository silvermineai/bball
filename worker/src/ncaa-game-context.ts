import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { ncaaBoxDb, researchDb } from "./research-db";

type Bindings = Env;
const querySchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026).default(2026),
  view: z.enum(["rosters", "officials"]).default("rosters"),
  gameId: z.string().trim().max(40).optional(),
  teamId: z.string().trim().max(40).optional(),
  athleteId: z.string().trim().max(40).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(10000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("game context database query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

export const ncaaGameContext = new Hono<{ Bindings: Bindings }>();

ncaaGameContext.get("/", zValidator("query", querySchema), async (c) => {
  const { season, view, gameId, teamId, athleteId, q, page, meta } = c.req.valid("query");
  const db = ncaaBoxDb(c.env);
  const research = researchDb(c.env);
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the archive fail.
    }
  }
  const table = view === "rosters" ? "bb_ncaa_game_rosters" : "bb_ncaa_officials";
  try {
    if (meta === "1") {
      const [seasons, count, source] = await withTimeout(Promise.all([
        db.prepare(`SELECT DISTINCT season FROM ${table} ORDER BY season DESC`).all(),
        db.prepare(`SELECT count(*) AS total FROM ${table} WHERE season=?`).bind(season).first<{ total: number }>(),
        research.prepare("SELECT season, dataset, json_extract(receipt_json,'$.url') AS url, json_extract(receipt_json,'$.fetched_at') AS fetched_at, json_extract(receipt_json,'$.sha256') AS sha256 FROM bb_sources WHERE dataset=? AND season=?").bind(view === "rosters" ? "ncaa_game_rosters" : "ncaa_officials", season).first(),
      ]), DB_TIMEOUT_MS);
      const response = c.json({
        view,
        season,
        seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
        total: Number(count?.total || 0),
        source: source ?? null,
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    }

    const clauses = ["season=?"];
    const binds: Array<string | number> = [season];
    if (gameId) { clauses.push("game_id=?"); binds.push(gameId); }
    if (teamId && view === "rosters") { clauses.push("team_id=?"); binds.push(teamId); }
    if (athleteId && view === "rosters") { clauses.push("athlete_id=?"); binds.push(athleteId); }
    if (q) {
      clauses.push(view === "rosters" ? "(athlete_name LIKE ? OR team_name LIKE ? OR game_id LIKE ?)" : "(official_name LIKE ? OR game_id LIKE ?)");
      const search = `%${q}%`;
      binds.push(...(view === "rosters" ? [search, search, search] : [search, search]));
    }
    const where = clauses.join(" AND ");
    const count = await withTimeout(db.prepare(`SELECT count(*) AS total FROM ${table} WHERE ${where}`).bind(...binds).first<{ total: number }>(), DB_TIMEOUT_MS);
    const rows = await withTimeout(db.prepare(
      view === "rosters"
        ? `SELECT season,game_id,team_id,athlete_id,team_name,home_away,athlete_name,jersey,position,starter,did_not_play,active,ejected,reason,raw_json FROM ${table} WHERE ${where} ORDER BY game_id DESC,team_name,athlete_name LIMIT 100 OFFSET ?`
        : `SELECT season,game_id,official_order,official_name,official_position,official_position_id,raw_json FROM ${table} WHERE ${where} ORDER BY game_id DESC,official_order LIMIT 100 OFFSET ?`,
    ).bind(...binds, page * 100).all(), DB_TIMEOUT_MS);
    const response = c.json({
      view, season, page, page_size: 100, total: Number(count?.total || 0),
      rows: rows.results.map(({ raw_json, ...row }) => {
        let raw: Record<string, unknown> = {};
        try { const parsed = JSON.parse(String(raw_json)); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>; } catch { /* source audit retains the row */ }
        return { ...row, raw };
      }),
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The NCAA game context archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
