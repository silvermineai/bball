import { researchDb } from "./research-db";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

export const recruitingRankings = new Hono<{ Bindings: Env }>();
const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;
const querySchema = z.object({
  season: z.coerce.number().int().min(2025).max(2035).default(2027),
  athlete_id: z.string().regex(/^\d{1,15}$/).optional(),
  q: z.string().trim().max(100).optional(),
  position: z.string().trim().max(12).optional(),
  rank_max: z.coerce.number().int().min(1).max(1000).optional(),
  committed: z.enum(["all", "yes", "no"]).default("all"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
});

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("recruiting rankings query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

recruitingRankings.get("/", zValidator("query", querySchema), async (c) => {
  const { season, athlete_id, q, position, rank_max, committed, page } = c.req.valid("query");
  const search = q ? `%${escapeLike(q)}%` : null;
  const positionValue = position ? position.toUpperCase() : null;
  const committedClause = committed === "yes"
    ? "r.committed_team_id IS NOT NULL"
    : committed === "no"
      ? "r.committed_team_id IS NULL"
      : "1=1";
  const filters = [
    "r.season=?",
    "r.edition=c.edition",
    ...(athlete_id ? ["r.athlete_id=?"] : []),
    ...(search ? ["(r.name LIKE ? ESCAPE '\\' OR r.high_school LIKE ? ESCAPE '\\' OR r.hometown LIKE ? ESCAPE '\\' OR r.committed_team_name LIKE ? ESCAPE '\\')"] : []),
    ...(positionValue ? ["upper(r.position)=?"] : []),
    ...(rank_max != null ? ["r.rank IS NOT NULL AND r.rank<=?"] : []),
    committedClause,
  ].join(" AND ");
  const binds: Array<string | number> = [season, ...(athlete_id ? [athlete_id] : []), ...(search ? [search, search, search, search] : []), ...(positionValue ? [positionValue] : []), ...(rank_max != null ? [rank_max] : [])];
  const db = researchDb(c.env);
  const cache = typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the rankings desk fail.
    }
  }
  try {
    const count = await withTimeout(db.prepare(
      `SELECT count(*) AS total,
              sum(CASE WHEN r.committed_team_id IS NOT NULL THEN 1 ELSE 0 END) AS committed_total,
              sum(CASE WHEN r.rank IS NOT NULL THEN 1 ELSE 0 END) AS ranked_total,
              sum(CASE WHEN r.grade IS NOT NULL AND r.grade > 0 THEN 1 ELSE 0 END) AS grade_total
         FROM bb_espn_recruiting r JOIN bb_espn_recruiting_current c ON c.season=r.season
        WHERE ${filters}`,
    ).bind(...binds).first<{ total: number; committed_total: number | null; ranked_total: number | null; grade_total: number | null }>(), DB_TIMEOUT_MS);
    const rows = await withTimeout(db.prepare(
      `SELECT r.athlete_id,r.name,r.position,r.grade,r.rank,r.position_rank,r.state_rank,r.region_rank,
              r.status,r.committed_team_id,r.committed_team_name,r.school_ids_json,r.high_school,
              r.hometown,r.height_inches,r.weight_pounds,r.captured_at,r.source_url
         FROM bb_espn_recruiting r JOIN bb_espn_recruiting_current c ON c.season=r.season
        WHERE ${filters}
        ORDER BY CASE WHEN r.rank IS NULL THEN 1 ELSE 0 END,r.rank,r.name
        LIMIT 50 OFFSET ?`,
    ).bind(...binds, page * 50).all(), DB_TIMEOUT_MS);
    const positions = await withTimeout(db.prepare(
      `SELECT COALESCE(NULLIF(upper(r.position),''),'Unknown') AS position, count(*) AS total
         FROM bb_espn_recruiting r JOIN bb_espn_recruiting_current c ON c.season=r.season
        WHERE ${filters}
        GROUP BY COALESCE(NULLIF(upper(r.position),''),'Unknown')
        ORDER BY total DESC, position ASC`,
    ).bind(...binds).all(), DB_TIMEOUT_MS);
    const destinations = await withTimeout(db.prepare(
      `SELECT CAST(r.committed_team_id AS TEXT) AS team_id,
              TRIM(r.committed_team_name) AS team,
              count(*) AS total,
              sum(CASE WHEN r.rank IS NOT NULL THEN 1 ELSE 0 END) AS ranked_total,
              sum(CASE WHEN r.rank IS NOT NULL AND r.rank<=100 THEN 1 ELSE 0 END) AS top100_total,
              min(r.rank) AS best_rank,
              avg(CASE WHEN r.rank IS NOT NULL THEN r.rank END) AS average_rank
         FROM bb_espn_recruiting r JOIN bb_espn_recruiting_current c ON c.season=r.season
        WHERE ${filters} AND r.committed_team_name IS NOT NULL AND TRIM(r.committed_team_name) <> ''
        GROUP BY CAST(r.committed_team_id AS TEXT), TRIM(r.committed_team_name)
        ORDER BY ranked_total DESC, top100_total DESC, total DESC, team ASC
        LIMIT 12`,
    ).bind(...binds).all(), DB_TIMEOUT_MS);
    const current = await withTimeout(db.prepare(
      "SELECT edition,captured_at FROM bb_espn_recruiting_current WHERE season=?",
    ).bind(season).first<{ edition: string; captured_at: string }>(), DB_TIMEOUT_MS);
    const response = c.json({
      season,
      page,
      page_size: 50,
      total: Number(count?.total || 0),
      cohort: {
        committed: Number(count?.committed_total || 0),
        ranked: Number(count?.ranked_total || 0),
        graded: Number(count?.grade_total || 0),
      },
      position_breakdown: positions.results.map((row) => ({
        position: String((row as { position?: string }).position || "Unknown"),
        total: Number((row as { total?: number }).total || 0),
      })),
      commitment_destinations: destinations.results.map((row) => ({
        team_id: row.team_id == null || String(row.team_id).trim() === "" ? null : String(row.team_id),
        team: String((row as { team?: string }).team || "Unknown"),
        total: Number((row as { total?: number }).total || 0),
        ranked_total: Number((row as { ranked_total?: number }).ranked_total || 0),
        top100_total: Number((row as { top100_total?: number }).top100_total || 0),
        best_rank: row.best_rank == null ? null : Number(row.best_rank),
        average_rank: row.average_rank == null ? null : Number(row.average_rank),
      })),
      edition: current?.edition || null,
      captured_at: current?.captured_at || null,
      source: {
        provider: "ESPN Recruiting",
        url: `https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/seasons/${season}/recruits`,
        methodology: "Public ESPN prospect ranking release. Rank, grade and commitment fields are source-reported; they are not transfer eligibility determinations.",
      },
      rows: rows.results.map((row) => ({
        ...row,
        school_ids: (() => { try { return JSON.parse(String((row as { school_ids_json?: string }).school_ids_json || "[]")); } catch { return []; } })(),
        school_ids_json: undefined,
      })),
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ season, page, page_size: 50, total: 0, cohort: { committed: 0, ranked: 0, graded: 0 }, position_breakdown: [], commitment_destinations: [], rows: [], source: "unavailable", unavailable_reason: "The ESPN recruiting release is temporarily unavailable." }, 200, { "Cache-Control": "no-store" });
  }
});
