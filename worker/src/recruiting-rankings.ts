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
  team_id: z.string().regex(/^\d{1,15}$/).optional(),
  q: z.string().trim().max(100).optional(),
  position: z.string().trim().max(12).optional(),
  rank_max: z.coerce.number().int().min(1).max(1000).optional(),
  committed: z.enum(["all", "yes", "no"]).default("all"),
  movement: z.enum(["all", "up", "down", "unchanged", "new", "unavailable"]).default("all"),
  history: z.enum(["0", "1"]).default("0"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  publication_check: z.string().trim().max(80).optional(),
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

// Some source releases use rank=1 as a placeholder on rows that have no
// grade or supporting position/state/region rank. The collector now rejects
// that shape, but older retained editions must remain reproducible in D1.
// Normalize it at read time as unavailable so a stale source placeholder can
// never become the public #1 prospect, a rank filter hit, or class-rank points.
const effectiveRank = (alias: string) =>
  `CASE WHEN ${alias}.rank IS NOT NULL AND ${alias}.grade = 0 AND ${alias}.position_rank IS NULL AND ${alias}.state_rank IS NULL AND ${alias}.region_rank IS NULL THEN NULL ELSE ${alias}.rank END`;

const withheldPlaceholderRank = (alias: string) =>
  `${alias}.rank IS NOT NULL AND ${alias}.grade = 0 AND ${alias}.position_rank IS NULL AND ${alias}.state_rank IS NULL AND ${alias}.region_rank IS NULL`;

recruitingRankings.get("/", zValidator("query", querySchema), async (c) => {
  const { season, athlete_id, team_id, q, position, rank_max, committed, movement, history: includeHistory, page } = c.req.valid("query");
  const search = q ? `%${escapeLike(q)}%` : null;
  const positionValue = position ? position.toUpperCase() : null;
  const committedClause = committed === "yes"
    ? "r.committed_team_id IS NOT NULL"
    : committed === "no"
      ? "r.committed_team_id IS NULL"
      : "1=1";
  const currentRank = effectiveRank("r");
  const previousRank = `(SELECT ${effectiveRank("p")} FROM bb_espn_recruiting p WHERE p.season=r.season AND p.athlete_id=r.athlete_id AND p.edition != r.edition AND p.captured_at < c.captured_at ORDER BY p.captured_at DESC, p.edition DESC LIMIT 1)`;
  const previousCapture = `(SELECT p.captured_at FROM bb_espn_recruiting p WHERE p.season=r.season AND p.athlete_id=r.athlete_id AND p.edition != r.edition AND p.captured_at < c.captured_at ORDER BY p.captured_at DESC, p.edition DESC LIMIT 1)`;
  const movementClause = movement === "up"
    ? `${previousRank} IS NOT NULL AND ${currentRank} IS NOT NULL AND ${currentRank} < ${previousRank}`
    : movement === "down"
      ? `${previousRank} IS NOT NULL AND ${currentRank} IS NOT NULL AND ${currentRank} > ${previousRank}`
      : movement === "unchanged"
        ? `${previousRank} IS NOT NULL AND ${currentRank} IS NOT NULL AND ${currentRank} = ${previousRank}`
        : movement === "new"
          ? `${previousCapture} IS NULL`
          : movement === "unavailable"
            ? `${previousCapture} IS NOT NULL AND (${previousRank} IS NULL OR ${currentRank} IS NULL)`
            : "1=1";
  const filters = [
    "r.season=?",
    "r.edition=c.edition",
    ...(athlete_id ? ["r.athlete_id=?"] : []),
    ...(team_id ? ["(CAST(r.committed_team_id AS TEXT)=? OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(r.school_ids_json) THEN r.school_ids_json ELSE '[]' END) school WHERE CAST(school.value AS TEXT)=?))"] : []),
    ...(search ? ["(r.name LIKE ? ESCAPE '\\' OR r.high_school LIKE ? ESCAPE '\\' OR r.hometown LIKE ? ESCAPE '\\' OR r.committed_team_name LIKE ? ESCAPE '\\')"] : []),
    ...(positionValue ? ["upper(r.position)=?"] : []),
    ...(rank_max != null ? [`${currentRank} IS NOT NULL AND ${currentRank}<=?`] : []),
    committedClause,
    movementClause,
  ].join(" AND ");
  const binds: Array<string | number> = [season, ...(athlete_id ? [athlete_id] : []), ...(team_id ? [team_id, team_id] : []), ...(search ? [search, search, search, search] : []), ...(positionValue ? [positionValue] : []), ...(rank_max != null ? [rank_max] : [])];
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
              sum(CASE WHEN ${currentRank} IS NOT NULL THEN 1 ELSE 0 END) AS ranked_total,
              sum(CASE WHEN r.grade IS NOT NULL AND r.grade > 0 THEN 1 ELSE 0 END) AS grade_total
         FROM bb_espn_recruiting r JOIN bb_espn_recruiting_current c ON c.season=r.season
        WHERE ${filters}`,
    ).bind(...binds).first<{ total: number; committed_total: number | null; ranked_total: number | null; grade_total: number | null }>(), DB_TIMEOUT_MS);
    const classContext = athlete_id ? await withTimeout(db.prepare(
      `SELECT count(*) AS class_total,
              sum(CASE WHEN r.committed_team_id IS NOT NULL THEN 1 ELSE 0 END) AS class_committed_total,
              sum(CASE WHEN ${currentRank} IS NOT NULL THEN 1 ELSE 0 END) AS class_ranked_total,
              sum(CASE WHEN r.grade IS NOT NULL AND r.grade > 0 THEN 1 ELSE 0 END) AS class_grade_total
         FROM bb_espn_recruiting r JOIN bb_espn_recruiting_current c ON c.season=r.season
        WHERE r.season=? AND r.edition=c.edition`,
    ).bind(season).first<{ class_total: number; class_committed_total: number | null; class_ranked_total: number | null; class_grade_total: number | null }>(), DB_TIMEOUT_MS) : null;
    const peerContext = athlete_id ? await withTimeout(db.prepare(
      `WITH target AS (
        SELECT r.athlete_id,
               NULLIF(upper(trim(r.position)),'') AS position,
               r.height_inches,
               r.weight_pounds,
               c.edition
          FROM bb_espn_recruiting r
          JOIN bb_espn_recruiting_current c ON c.season=r.season AND c.edition=r.edition
         WHERE r.season=? AND r.athlete_id=?
         LIMIT 1
      )
      SELECT t.athlete_id,t.position,t.height_inches AS target_height_inches,
             t.weight_pounds AS target_weight_pounds,t.edition,
             count(r.athlete_id) AS peer_total,
             sum(CASE WHEN r.position_rank IS NOT NULL AND r.position_rank > 0 THEN 1 ELSE 0 END) AS position_ranked_total,
             sum(CASE WHEN r.height_inches IS NOT NULL AND r.height_inches > 0 THEN 1 ELSE 0 END) AS height_recorded,
             sum(CASE WHEN r.height_inches IS NOT NULL AND r.height_inches > 0 AND t.height_inches IS NOT NULL AND r.height_inches < t.height_inches THEN 1 ELSE 0 END) AS height_below,
             sum(CASE WHEN r.height_inches IS NOT NULL AND r.height_inches > 0 AND t.height_inches IS NOT NULL AND r.height_inches = t.height_inches THEN 1 ELSE 0 END) AS height_equal,
             avg(CASE WHEN r.height_inches IS NOT NULL AND r.height_inches > 0 THEN r.height_inches END) AS average_height_inches,
             sum(CASE WHEN r.weight_pounds IS NOT NULL AND r.weight_pounds > 0 THEN 1 ELSE 0 END) AS weight_recorded,
             sum(CASE WHEN r.weight_pounds IS NOT NULL AND r.weight_pounds > 0 AND t.weight_pounds IS NOT NULL AND r.weight_pounds < t.weight_pounds THEN 1 ELSE 0 END) AS weight_below,
             sum(CASE WHEN r.weight_pounds IS NOT NULL AND r.weight_pounds > 0 AND t.weight_pounds IS NOT NULL AND r.weight_pounds = t.weight_pounds THEN 1 ELSE 0 END) AS weight_equal,
             avg(CASE WHEN r.weight_pounds IS NOT NULL AND r.weight_pounds > 0 THEN r.weight_pounds END) AS average_weight_pounds
        FROM target t
        JOIN bb_espn_recruiting r ON r.season=? AND r.edition=t.edition
         AND NULLIF(upper(trim(r.position)),'')=t.position
       GROUP BY t.athlete_id,t.position,t.height_inches,t.weight_pounds,t.edition`,
    ).bind(season, athlete_id, season).first<Record<string, string | number | null>>(), DB_TIMEOUT_MS) : null;
    const fieldCoverage = await withTimeout(db.prepare(
      `SELECT count(*) AS total,
              sum(CASE WHEN NULLIF(TRIM(r.position),'') IS NOT NULL THEN 1 ELSE 0 END) AS position,
              sum(CASE WHEN ${currentRank} IS NOT NULL THEN 1 ELSE 0 END) AS rank,
              sum(CASE WHEN r.grade IS NOT NULL AND r.grade > 0 THEN 1 ELSE 0 END) AS grade,
              sum(CASE WHEN r.position_rank IS NOT NULL THEN 1 ELSE 0 END) AS position_rank,
              sum(CASE WHEN r.state_rank IS NOT NULL THEN 1 ELSE 0 END) AS state_rank,
              sum(CASE WHEN r.region_rank IS NOT NULL THEN 1 ELSE 0 END) AS region_rank,
              sum(CASE WHEN r.committed_team_id IS NOT NULL THEN 1 ELSE 0 END) AS committed_team,
              sum(CASE WHEN NULLIF(TRIM(r.high_school),'') IS NOT NULL THEN 1 ELSE 0 END) AS high_school,
              sum(CASE WHEN NULLIF(TRIM(r.hometown),'') IS NOT NULL THEN 1 ELSE 0 END) AS hometown,
              sum(CASE WHEN r.height_inches IS NOT NULL THEN 1 ELSE 0 END) AS height,
              sum(CASE WHEN r.weight_pounds IS NOT NULL THEN 1 ELSE 0 END) AS weight
         FROM bb_espn_recruiting r JOIN bb_espn_recruiting_current c ON c.season=r.season
        WHERE ${filters}`,
    ).bind(...binds).first<Record<string, number | null>>(), DB_TIMEOUT_MS);
    const rows = await withTimeout(db.prepare(
      `SELECT r.athlete_id,r.name,r.position,r.grade,${currentRank} AS rank,r.position_rank,r.state_rank,r.region_rank,
              r.status,r.committed_team_id,r.committed_team_name,r.school_ids_json,r.high_school,
              r.hometown,r.height_inches,r.weight_pounds,r.captured_at,r.source_url,
              (SELECT ${effectiveRank("p")} FROM bb_espn_recruiting p
                WHERE p.season=r.season AND p.athlete_id=r.athlete_id
                  AND p.edition != r.edition
                  AND p.captured_at < c.captured_at
                ORDER BY p.captured_at DESC, p.edition DESC LIMIT 1) AS previous_rank,
              (SELECT p.captured_at FROM bb_espn_recruiting p
                WHERE p.season=r.season AND p.athlete_id=r.athlete_id
                  AND p.edition != r.edition
                  AND p.captured_at < c.captured_at
                ORDER BY p.captured_at DESC, p.edition DESC LIMIT 1) AS previous_captured_at
         FROM bb_espn_recruiting r JOIN bb_espn_recruiting_current c ON c.season=r.season
        WHERE ${filters}
        ORDER BY CASE WHEN ${currentRank} IS NULL THEN 1 ELSE 0 END,${currentRank},r.name
        LIMIT 50 OFFSET ?`,
    ).bind(...binds, page * 50).all(), DB_TIMEOUT_MS);
    const movement = await withTimeout(db.prepare(
      `WITH current_rows AS (
        SELECT ${currentRank} AS rank,
          (SELECT ${effectiveRank("p")} FROM bb_espn_recruiting p
            WHERE p.season=r.season AND p.athlete_id=r.athlete_id
              AND p.edition != r.edition
              AND p.captured_at < c.captured_at
            ORDER BY p.captured_at DESC, p.edition DESC LIMIT 1) AS previous_rank
          ,(SELECT p.captured_at FROM bb_espn_recruiting p
            WHERE p.season=r.season AND p.athlete_id=r.athlete_id
              AND p.edition != r.edition
              AND p.captured_at < c.captured_at
            ORDER BY p.captured_at DESC, p.edition DESC LIMIT 1) AS previous_captured_at
          FROM bb_espn_recruiting r JOIN bb_espn_recruiting_current c ON c.season=r.season
         WHERE ${filters}
      )
      SELECT count(*) AS total,
        sum(CASE WHEN previous_captured_at IS NULL THEN 1 ELSE 0 END) AS new_to_release,
        sum(CASE WHEN previous_rank IS NOT NULL AND rank IS NOT NULL AND rank < previous_rank THEN 1 ELSE 0 END) AS moved_up,
        sum(CASE WHEN previous_rank IS NOT NULL AND rank IS NOT NULL AND rank > previous_rank THEN 1 ELSE 0 END) AS moved_down,
        sum(CASE WHEN previous_rank IS NOT NULL AND rank IS NOT NULL AND rank = previous_rank THEN 1 ELSE 0 END) AS unchanged,
        sum(CASE WHEN previous_captured_at IS NOT NULL AND (previous_rank IS NULL OR rank IS NULL) THEN 1 ELSE 0 END) AS rank_unavailable
        FROM current_rows`,
    ).bind(...binds).first<{
      total: number;
      new_to_release: number | null;
      moved_up: number | null;
      moved_down: number | null;
      unchanged: number | null;
      rank_unavailable: number | null;
    }>(), DB_TIMEOUT_MS);
    const rankQuality = await withTimeout(db.prepare(
      `WITH cohort_rows AS (
        SELECT ${currentRank} AS rank,
               CASE WHEN ${withheldPlaceholderRank("r")} THEN 1 ELSE 0 END AS placeholder_withheld
          FROM bb_espn_recruiting r JOIN bb_espn_recruiting_current c ON c.season=r.season
         WHERE ${filters}
      ), ranked_rows AS (
        SELECT rank FROM cohort_rows WHERE rank IS NOT NULL
      ), tied_ranks AS (
        SELECT rank, count(*) AS rows
          FROM ranked_rows
         GROUP BY rank
        HAVING count(*) > 1
      )
      SELECT (SELECT count(*) FROM tied_ranks) AS tied_rank_values,
             (SELECT COALESCE(sum(rows),0) FROM tied_ranks) AS tied_rows,
             (SELECT COALESCE(sum(placeholder_withheld),0) FROM cohort_rows) AS withheld_placeholder_rows`,
    ).bind(...binds).first<{ tied_rank_values: number | null; tied_rows: number | null; withheld_placeholder_rows: number | null }>(), DB_TIMEOUT_MS);
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
              sum(CASE WHEN ${currentRank} IS NOT NULL THEN 1 ELSE 0 END) AS ranked_total,
              sum(CASE WHEN ${currentRank} IS NOT NULL AND ${currentRank}<=100 THEN 1 ELSE 0 END) AS top100_total,
              sum(CASE WHEN ${currentRank} IS NOT NULL THEN MAX(1, 101-${currentRank}) ELSE 0 END) AS source_rank_points,
              min(${currentRank}) AS best_rank,
              avg(CASE WHEN ${currentRank} IS NOT NULL THEN ${currentRank} END) AS average_rank
         FROM bb_espn_recruiting r JOIN bb_espn_recruiting_current c ON c.season=r.season
        WHERE ${filters} AND r.committed_team_name IS NOT NULL AND TRIM(r.committed_team_name) <> ''
        GROUP BY CAST(r.committed_team_id AS TEXT), TRIM(r.committed_team_name)
        ORDER BY source_rank_points DESC, top100_total DESC, ranked_total DESC, total DESC, team ASC
        LIMIT 12`,
    ).bind(...binds).all(), DB_TIMEOUT_MS);
    const destinationPositions = await withTimeout(db.prepare(
      `SELECT CAST(r.committed_team_id AS TEXT) AS team_id,
              COALESCE(NULLIF(upper(r.position),''),'Unknown') AS position,
              count(*) AS total
         FROM bb_espn_recruiting r JOIN bb_espn_recruiting_current c ON c.season=r.season
        WHERE ${filters} AND r.committed_team_id IS NOT NULL
        GROUP BY CAST(r.committed_team_id AS TEXT), COALESCE(NULLIF(upper(r.position),''),'Unknown')
        ORDER BY total DESC, position ASC`,
    ).bind(...binds).all(), DB_TIMEOUT_MS);
    const positionsByTeam = new Map<string, Array<{ position: string; total: number }>>();
    for (const row of destinationPositions.results) {
      const teamId = row.team_id == null ? "" : String(row.team_id);
      if (!teamId) continue;
      const positions = positionsByTeam.get(teamId) || [];
      positions.push({
        position: String((row as { position?: string }).position || "Unknown"),
        total: Number((row as { total?: number }).total || 0),
      });
      positionsByTeam.set(teamId, positions);
    }
    const current = await withTimeout(db.prepare(
      "SELECT edition,captured_at FROM bb_espn_recruiting_current WHERE season=?",
    ).bind(season).first<{ edition: string; captured_at: string }>(), DB_TIMEOUT_MS);
    const historyRows = athlete_id && includeHistory === "1"
      ? await withTimeout(db.prepare(
        `SELECT h.edition,h.captured_at,${effectiveRank("h")} AS rank,h.grade,h.status,h.committed_team_id,h.committed_team_name,h.source_url
           FROM bb_espn_recruiting h
          WHERE h.season=? AND h.athlete_id=?
          ORDER BY captured_at ASC, edition ASC`,
      ).bind(season, athlete_id).all(), DB_TIMEOUT_MS)
      : null;
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
      class_context: classContext ? {
        total: Number(classContext.class_total || 0),
        committed: Number(classContext.class_committed_total || 0),
        ranked: Number(classContext.class_ranked_total || 0),
        graded: Number(classContext.class_grade_total || 0),
      } : undefined,
      peer_context: peerContext ? {
        season,
        athlete_id: String(peerContext.athlete_id || ""),
        edition: String(peerContext.edition || ""),
        position: peerContext.position == null ? null : String(peerContext.position),
        target_height_inches: peerContext.target_height_inches == null ? null : Number(peerContext.target_height_inches),
        target_weight_pounds: peerContext.target_weight_pounds == null ? null : Number(peerContext.target_weight_pounds),
        peers: Number(peerContext.peer_total || 0),
        position_ranked: Number(peerContext.position_ranked_total || 0),
        height_recorded: Number(peerContext.height_recorded || 0),
        height_below: Number(peerContext.height_below || 0),
        height_equal: Number(peerContext.height_equal || 0),
        average_height_inches: peerContext.average_height_inches == null ? null : Number(peerContext.average_height_inches),
        weight_recorded: Number(peerContext.weight_recorded || 0),
        weight_below: Number(peerContext.weight_below || 0),
        weight_equal: Number(peerContext.weight_equal || 0),
        average_weight_pounds: peerContext.average_weight_pounds == null ? null : Number(peerContext.average_weight_pounds),
      } : undefined,
      field_coverage: {
        total: Number(fieldCoverage?.total || count?.total || 0),
        position: Number(fieldCoverage?.position || 0),
        rank: Number(fieldCoverage?.rank || 0),
        grade: Number(fieldCoverage?.grade || 0),
        position_rank: Number(fieldCoverage?.position_rank || 0),
        state_rank: Number(fieldCoverage?.state_rank || 0),
        region_rank: Number(fieldCoverage?.region_rank || 0),
        committed_team: Number(fieldCoverage?.committed_team || 0),
        high_school: Number(fieldCoverage?.high_school || 0),
        hometown: Number(fieldCoverage?.hometown || 0),
        height: Number(fieldCoverage?.height || 0),
        weight: Number(fieldCoverage?.weight || 0),
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
        source_rank_points: Number((row as { source_rank_points?: number }).source_rank_points || 0),
        best_rank: row.best_rank == null ? null : Number(row.best_rank),
        average_rank: row.average_rank == null ? null : Number(row.average_rank),
        position_breakdown: row.team_id == null ? [] : positionsByTeam.get(String(row.team_id)) || [],
      })),
      rank_movement: {
        total: Number(movement?.total || 0),
        new_to_release: Number(movement?.new_to_release || 0),
        moved_up: Number(movement?.moved_up || 0),
        moved_down: Number(movement?.moved_down || 0),
        unchanged: Number(movement?.unchanged || 0),
        rank_unavailable: Number(movement?.rank_unavailable || 0),
      },
      rank_quality: {
        ranked_rows: Number(count?.ranked_total || 0),
        tied_rank_values: Number(rankQuality?.tied_rank_values || 0),
        tied_rows: Number(rankQuality?.tied_rows || 0),
        withheld_placeholder_rows: Number(rankQuality?.withheld_placeholder_rows || 0),
      },
      edition: current?.edition || null,
      captured_at: current?.captured_at || null,
      history: historyRows
        ? historyRows.results.map((row) => ({
          edition: String((row as { edition?: string }).edition || ""),
          captured_at: String((row as { captured_at?: string }).captured_at || ""),
          rank: row.rank == null ? null : Number(row.rank),
          grade: row.grade == null ? null : Number(row.grade),
          status: row.status == null ? null : String(row.status),
          committed_team_id: row.committed_team_id == null ? null : String(row.committed_team_id),
          committed_team_name: row.committed_team_name == null ? null : String(row.committed_team_name),
          source_url: "",
        }))
        : undefined,
      rows: rows.results.map((row) => ({
        ...row,
        previous_rank: row.previous_rank == null ? null : Number(row.previous_rank),
        previous_captured_at: row.previous_captured_at == null ? null : String(row.previous_captured_at),
        school_ids: (() => { try { return JSON.parse(String((row as { school_ids_json?: string }).school_ids_json || "[]")); } catch { return []; } })(),
        school_ids_json: undefined,
        source_url: "",
      })),
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ season, page, page_size: 50, total: 0, cohort: { committed: 0, ranked: 0, graded: 0 }, position_breakdown: [], commitment_destinations: [], rows: [], source: "unavailable", unavailable_reason: "The ESPN recruiting release is temporarily unavailable." }, 200, { "Cache-Control": "no-store" });
  }
});
