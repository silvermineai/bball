import { researchDb } from "./research-db";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
const querySchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026).default(2026),
  q: z.string().trim().max(120).optional(),
  classYear: z.string().trim().regex(/^[A-Za-z0-9. -]{0,20}$/).optional(),
  position: z.string().trim().regex(/^[A-Za-z0-9 -]{0,20}$/).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});
const sourceSchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026),
});
const transitionSchema = z.object({
  fromSeason: z.coerce.number().int().min(2010).max(2026),
  toSeason: z.coerce.number().int().min(2010).max(2026),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(100).default(0),
}).refine((value) => value.fromSeason < value.toSeason, {
  message: "fromSeason must be earlier than toSeason",
  path: ["fromSeason"],
});

export const ncaaRosters = new Hono<{ Bindings: Bindings }>();

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("NCAA roster database query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined"
    ? null
    : (caches as unknown as { default: Cache }).default;
}

/**
 * Compare adjacent NCAA source releases at the program level. The overlap
 * count is deliberately described as source-ID overlap: it is useful for
 * roster planning, but it is not a person-level transfer or eligibility
 * determination.
 */
ncaaRosters.get("/transitions", zValidator("query", transitionSchema), async (c) => {
  const { fromSeason, toSeason, q, page } = c.req.valid("query");
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the roster endpoint fail.
    }
  }
  const db = researchDb(c.env);
  const clauses: string[] = [];
  const filterBinds: string[] = [];
  if (q) {
    clauses.push("(team_name LIKE ? OR team_id LIKE ?)");
    const search = `%${q}%`;
    filterBinds.push(search, search);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const cte = `
    WITH previous_roster AS (
      SELECT team_id, MAX(team_name) AS team_name, COUNT(*) AS previous_players
      FROM bb_ncaa_rosters WHERE season=? GROUP BY team_id
    ), current_roster AS (
      SELECT team_id, MAX(team_name) AS team_name, COUNT(*) AS current_players
      FROM bb_ncaa_rosters WHERE season=? GROUP BY team_id
    ), teams AS (
      SELECT team_id FROM previous_roster UNION SELECT team_id FROM current_roster
    ), overlap AS (
      SELECT c.team_id, COUNT(*) AS overlap_players
      FROM bb_ncaa_rosters c
      JOIN bb_ncaa_rosters p ON p.season=? AND p.team_id=c.team_id AND p.player_id=c.player_id
      WHERE c.season=? GROUP BY c.team_id
    ), joined AS (
      SELECT t.team_id,
             COALESCE(c.team_name, p.team_name, t.team_id) AS team_name,
             COALESCE(p.previous_players, 0) AS previous_players,
             COALESCE(c.current_players, 0) AS current_players,
             COALESCE(o.overlap_players, 0) AS overlap_players
      FROM teams t
      LEFT JOIN previous_roster p ON p.team_id=t.team_id
      LEFT JOIN current_roster c ON c.team_id=t.team_id
      LEFT JOIN overlap o ON o.team_id=t.team_id
    )`;
  try {
  const count = await withTimeout(db.prepare(`${cte} SELECT COUNT(*) AS total FROM joined ${where}`).bind(fromSeason, toSeason, fromSeason, toSeason, ...filterBinds).first<{ total: number }>(), DB_TIMEOUT_MS);
  const rows = await withTimeout(db.prepare(`${cte}
    SELECT team_id, team_name, previous_players, current_players, overlap_players,
           current_players - overlap_players AS new_players,
           previous_players - overlap_players AS departed_players,
           CASE WHEN current_players > 0 THEN CAST(overlap_players AS REAL) / current_players ELSE NULL END AS continuity_rate
    FROM joined ${where}
    ORDER BY current_players DESC, overlap_players DESC, team_name ASC, team_id ASC
    LIMIT 40 OFFSET ?`).bind(fromSeason, toSeason, fromSeason, toSeason, ...filterBinds, page * 40).all(), DB_TIMEOUT_MS);
  const response = c.json({
    from_season: fromSeason,
    to_season: toSeason,
    page,
    page_size: 40,
    total: Number(count?.total || 0),
    rows: rows.results.map((row) => ({
      team_id: String((row as { team_id: unknown }).team_id),
      team_name: String((row as { team_name: unknown }).team_name),
      previous_players: Number((row as { previous_players: unknown }).previous_players || 0),
      current_players: Number((row as { current_players: unknown }).current_players || 0),
      overlap_players: Number((row as { overlap_players: unknown }).overlap_players || 0),
      new_players: Number((row as { new_players: unknown }).new_players || 0),
      departed_players: Number((row as { departed_players: unknown }).departed_players || 0),
      continuity_rate: (row as { continuity_rate: number | null }).continuity_rate == null ? null : Number((row as { continuity_rate: unknown }).continuity_rate),
    })),
  });
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
  } catch {
    return c.json({ error: "The NCAA roster transition archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});

/** Stream the exact NCAA roster release whose receipt is active in D1. */
ncaaRosters.get("/source", zValidator("query", sourceSchema), async (c) => {
  const { season } = c.req.valid("query");
  let row: { receipt_json: string } | null = null;
  try {
    row = await withTimeout(researchDb(c.env).prepare(
      "SELECT receipt_json FROM bb_sources WHERE dataset=? AND season=?",
    ).bind("ncaa_team_rosters", season).first<{ receipt_json: string }>(), DB_TIMEOUT_MS);
  } catch {
    return c.json({ error: "The NCAA roster source is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
  let digest = "";
  try {
    const receipt = row?.receipt_json ? JSON.parse(row.receipt_json) as { sha256?: unknown } : null;
    digest = typeof receipt?.sha256 === "string" ? receipt.sha256 : "";
  } catch {
    return c.text("NCAA roster source receipt is invalid", 503);
  }
  if (!/^[a-f0-9]{64}$/.test(digest)) return c.text("NCAA roster source release not found", 404);
  const headers = new Headers({
    "Content-Type": "application/vnd.apache.parquet",
    "Content-Disposition": `attachment; filename="ncaa_mbb_team_rosters_${season}.parquet"`,
    ETag: `"${digest}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, follow",
  });
  if (c.req.header("If-None-Match")?.split(",").map((tag) => tag.trim()).includes(`"${digest}"`)) return new Response(null, { status: 304, headers });
  let object: R2ObjectBody | null = null;
  try {
    object = await withTimeout(c.env.RESEARCH_ARCHIVE.get(`basketball/ncaa-rosters/${season}/${digest}.parquet`) as Promise<R2ObjectBody | null>, DB_TIMEOUT_MS);
  } catch {
    return c.json({ error: "The NCAA roster source is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
  if (!object || !("body" in object)) return c.text("NCAA roster source release is temporarily unavailable", 503);
  return new Response(object.body, { headers });
});

ncaaRosters.get("/", zValidator("query", querySchema), async (c) => {
  const { season, q, classYear, position, page, meta } = c.req.valid("query");
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the roster endpoint fail.
    }
  }
  if (meta === "1") {
    try {
    const [seasons, classes, positions, count, source] = await withTimeout(researchDb(c.env).batch([
      researchDb(c.env).prepare("SELECT DISTINCT season FROM bb_ncaa_rosters ORDER BY season DESC"),
      researchDb(c.env).prepare("SELECT DISTINCT json_extract(profile_json,'$.class') AS value FROM bb_ncaa_rosters WHERE season=? AND value IS NOT NULL AND value != '' ORDER BY value").bind(season),
      researchDb(c.env).prepare("SELECT DISTINCT json_extract(profile_json,'$.position') AS value FROM bb_ncaa_rosters WHERE season=? AND value IS NOT NULL AND value != '' ORDER BY value").bind(season),
      researchDb(c.env).prepare("SELECT count(*) AS total FROM bb_ncaa_rosters WHERE season=?").bind(season),
      researchDb(c.env).prepare("SELECT json_extract(receipt_json,'$.url') AS url, json_extract(receipt_json,'$.fetched_at') AS fetched_at, json_extract(receipt_json,'$.sha256') AS sha256 FROM bb_sources WHERE dataset='ncaa_team_rosters' AND season=?").bind(season),
    ]), DB_TIMEOUT_MS);
    const response = c.json({
      seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
      classes: classes.results.map((row) => String((row as { value: string }).value)),
      positions: positions.results.map((row) => String((row as { value: string }).value)),
      total: Number((count.results[0] as { total: number }).total || 0),
      source: (() => {
        const row = source.results[0] as { url?: unknown; fetched_at?: unknown; sha256?: unknown } | undefined;
        return {
          url: typeof row?.url === "string" ? row.url : null,
          fetched_at: typeof row?.fetched_at === "string" ? row.fetched_at : null,
          sha256: typeof row?.sha256 === "string" ? row.sha256 : null,
        };
      })(),
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
    } catch {
      return c.json({ error: "The NCAA roster catalog is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
  }
  const clauses = ["season=?"];
  const binds: Array<string | number> = [season];
  if (q) {
    clauses.push("(player_name LIKE ? OR team_name LIKE ? OR player_id LIKE ? OR json_extract(profile_json,'$.high_school') LIKE ? OR json_extract(profile_json,'$.hometown') LIKE ?)");
    const search = `%${q}%`;
    binds.push(search, search, search, search, search);
  }
  if (classYear) { clauses.push("json_extract(profile_json,'$.class')=?"); binds.push(classYear); }
  if (position) { clauses.push("json_extract(profile_json,'$.position')=?"); binds.push(position); }
  const where = clauses.join(" AND ");
  try {
  const count = await withTimeout(researchDb(c.env).prepare(`SELECT count(*) AS total FROM bb_ncaa_rosters WHERE ${where}`).bind(...binds).first<{ total: number }>(), DB_TIMEOUT_MS);
  const rows = await withTimeout(researchDb(c.env).prepare(
    `SELECT r.season,r.team_id,r.player_id,r.team_name,r.player_name,r.profile_json,
            s.games AS recorded_games,s.minutes AS recorded_minutes,
            s.points AS recorded_points,s.rebounds AS recorded_rebounds,
            s.assists AS recorded_assists,
            sh.stats_json AS shooting_json
     FROM bb_ncaa_rosters r
     LEFT JOIN (
       SELECT season,player_id,team_id,SUM(games) AS games,
              SUM(COALESCE(CAST(json_extract(stats_json,'$.mins') AS REAL),0)) AS minutes,
              SUM(COALESCE(CAST(json_extract(stats_json,'$.pts') AS REAL),0)) AS points,
              SUM(COALESCE(CAST(json_extract(stats_json,'$.orb') AS REAL),0) + COALESCE(CAST(json_extract(stats_json,'$.drb') AS REAL),0)) AS rebounds,
              SUM(COALESCE(CAST(json_extract(stats_json,'$.ast') AS REAL),0)) AS assists
       FROM bb_ncaa_player_season GROUP BY season,player_id,team_id
     ) s ON s.season=r.season AND s.team_id=r.team_id AND s.player_id=r.player_id
     LEFT JOIN bb_ncaa_player_shooting sh ON sh.season=r.season AND sh.team_id=r.team_id AND sh.player_id=r.player_id
     WHERE ${where.replaceAll("season=?", "r.season=?").replaceAll("player_name", "r.player_name").replaceAll("team_name", "r.team_name").replaceAll("player_id", "r.player_id").replaceAll("team_id", "r.team_id")}
     ORDER BY r.player_name ASC, r.team_name ASC, r.player_id ASC LIMIT 40 OFFSET ?`,
  ).bind(...binds, page * 40).all(), DB_TIMEOUT_MS);
  const response = c.json({ season, page, page_size: 40, total: Number(count?.total || 0), rows: rows.results.map(({ profile_json, shooting_json, ...row }) => {
    let profile: Record<string, unknown> = {};
    let shooting: unknown = null;
    try {
      const parsed = JSON.parse(String(profile_json));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) profile = parsed as Record<string, unknown>;
    } catch {
      // Preserve the roster row while withholding a malformed profile payload.
    }
    if (shooting_json) {
      try { shooting = JSON.parse(String(shooting_json)); } catch { shooting = null; }
    }
    return { ...row, profile, shooting };
  }) });
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
  } catch {
    return c.json({ error: "The NCAA roster archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
