import { researchDb } from "./research-db";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

export type PublisherField = {
  category: "averages" | "totals" | "miscellaneous";
  key: string;
  label: string;
  unit: "per game" | "percent" | "count" | "ratio" | "text";
  derived_from?: string;
  component?: "made" | "attempted";
};

export type PublisherFieldCoverage = {
  category: PublisherField["category"];
  key: string;
  observed: number;
  missing: number;
  share: number | null;
};

// These are the source fields present in the attributed SportsDataverse
// player-season release. The allow-list keeps JSON paths out of SQL input and
// makes the public browser honest about what the publisher actually supplied.
export const PUBLISHER_FIELDS: PublisherField[] = [
  ["averages", "gamesPlayed", "Games Played", "count"],
  ["averages", "gamesStarted", "Games Started", "count"],
  ["averages", "avgMinutes", "Minutes Per Game", "per game"],
  ["averages", "avgFieldGoalsMade-avgFieldGoalsAttempted", "Field Goals Made-Attempted Per Game", "text"],
  ["averages", "fieldGoalPct", "Field Goal Percentage", "percent"],
  ["averages", "avgThreePointFieldGoalsMade-avgThreePointFieldGoalsAttempted", "3-Point Field Goals Made-Attempted Per Game", "text"],
  ["averages", "threePointFieldGoalPct", "3-Point Field Goal Percentage", "percent"],
  ["averages", "avgFreeThrowsMade-avgFreeThrowsAttempted", "Free Throws Made-Attempted Per Game", "text"],
  ["averages", "freeThrowPct", "Free Throw Percentage", "percent"],
  ["averages", "avgOffensiveRebounds", "Offensive Rebounds Per Game", "per game"],
  ["averages", "avgDefensiveRebounds", "Defensive Rebounds Per Game", "per game"],
  ["averages", "avgRebounds", "Rebounds Per Game", "per game"],
  ["averages", "avgAssists", "Assists Per Game", "per game"],
  ["averages", "avgBlocks", "Blocks Per Game", "per game"],
  ["averages", "avgSteals", "Steals Per Game", "per game"],
  ["averages", "avgFouls", "Fouls Per Game", "per game"],
  ["averages", "avgTurnovers", "Turnovers Per Game", "per game"],
  ["averages", "avgPoints", "Points Per Game", "per game"],
  ["totals", "fieldGoalsMade-fieldGoalsAttempted", "Field Goals Made-Attempted", "text"],
  ["totals", "fieldGoalPct", "Field Goal Percentage", "percent"],
  ["totals", "threePointFieldGoalsMade-threePointFieldGoalsAttempted", "3-Point Field Goals Made-Attempted", "text"],
  ["totals", "threePointFieldGoalPct", "3-Point Field Goal Percentage", "percent"],
  ["totals", "freeThrowsMade-freeThrowsAttempted", "Free Throws Made-Attempted", "text"],
  ["totals", "freeThrowPct", "Free Throw Percentage", "percent"],
  ["totals", "offensiveRebounds", "Offensive Rebounds", "count"],
  ["totals", "defensiveRebounds", "Defensive Rebounds", "count"],
  ["totals", "totalRebounds", "Rebounds", "count"],
  ["totals", "assists", "Assists", "count"],
  ["totals", "blocks", "Blocks", "count"],
  ["totals", "steals", "Steals", "count"],
  ["totals", "fouls", "Fouls", "count"],
  ["totals", "turnovers", "Turnovers", "count"],
  ["totals", "points", "Points", "count"],
  ["miscellaneous", "doubleDouble", "Double Doubles", "count"],
  ["miscellaneous", "tripleDouble", "Triple Doubles", "count"],
  ["miscellaneous", "disqualifications", "Disqualifications", "count"],
  ["miscellaneous", "ejections", "Ejections", "count"],
  ["miscellaneous", "technicalFouls", "Technical Fouls", "count"],
  ["miscellaneous", "flagrantFouls", "Flagrant Fouls", "count"],
  ["miscellaneous", "assistTurnoverRatio", "Assist To Turnover Ratio", "ratio"],
  ["miscellaneous", "stealTurnoverRatio", "Steal To Turnover Ratio", "ratio"],
  ["miscellaneous", "rating", "Rating", "ratio"],
  ["miscellaneous", "scoringEfficiency", "Scoring Efficiency", "ratio"],
  ["miscellaneous", "shootingEfficiency", "Shooting Efficiency", "ratio"],
].map(([category, key, label, unit]) => ({
  category: category as PublisherField["category"],
  key,
  label,
  unit: unit as PublisherField["unit"],
})).concat([
  // The publisher stores each shooting split as a single display string
  // (for example, `60-168`) with a null numeric value. Expose each recorded
  // component as a sortable number while keeping the original pair in the
  // response's `display` field. These are lossless parses, not estimates.
  ["averages", "avgFieldGoalsMade", "Field Goals Made Per Game", "per game", "avgFieldGoalsMade-avgFieldGoalsAttempted", "made"],
  ["averages", "avgFieldGoalsAttempted", "Field Goals Attempted Per Game", "per game", "avgFieldGoalsMade-avgFieldGoalsAttempted", "attempted"],
  ["averages", "avgThreePointFieldGoalsMade", "3-Point Field Goals Made Per Game", "per game", "avgThreePointFieldGoalsMade-avgThreePointFieldGoalsAttempted", "made"],
  ["averages", "avgThreePointFieldGoalsAttempted", "3-Point Field Goals Attempted Per Game", "per game", "avgThreePointFieldGoalsMade-avgThreePointFieldGoalsAttempted", "attempted"],
  ["averages", "avgFreeThrowsMade", "Free Throws Made Per Game", "per game", "avgFreeThrowsMade-avgFreeThrowsAttempted", "made"],
  ["averages", "avgFreeThrowsAttempted", "Free Throws Attempted Per Game", "per game", "avgFreeThrowsMade-avgFreeThrowsAttempted", "attempted"],
  ["totals", "fieldGoalsMade", "Field Goals Made", "count", "fieldGoalsMade-fieldGoalsAttempted", "made"],
  ["totals", "fieldGoalsAttempted", "Field Goals Attempted", "count", "fieldGoalsMade-fieldGoalsAttempted", "attempted"],
  ["totals", "threePointFieldGoalsMade", "3-Point Field Goals Made", "count", "threePointFieldGoalsMade-threePointFieldGoalsAttempted", "made"],
  ["totals", "threePointFieldGoalsAttempted", "3-Point Field Goals Attempted", "count", "threePointFieldGoalsMade-threePointFieldGoalsAttempted", "attempted"],
  ["totals", "freeThrowsMade", "Free Throws Made", "count", "freeThrowsMade-freeThrowsAttempted", "made"],
  ["totals", "freeThrowsAttempted", "Free Throws Attempted", "count", "freeThrowsMade-freeThrowsAttempted", "attempted"],
].map(([category, key, label, unit, derived_from, component]) => ({
  category: category as PublisherField["category"],
  key,
  label,
  unit: unit as PublisherField["unit"],
  derived_from,
  component: component as PublisherField["component"],
})));

function sourceKey(field: PublisherField) {
  return field.derived_from || field.key;
}

function jsonPath(field: PublisherField, leaf: "value" | "display") {
  return `$.${field.category}.${sourceKey(field)}.${leaf}`;
}

/**
 * Return a numeric SQL expression for a source value. Paired shooting fields
 * are parsed only when the selected component contains a non-negative decimal
 * number. SQLite otherwise casts malformed text to zero, which would erase the
 * distinction between an observed zero and an unusable source value.
 */
function numericExpression(field: PublisherField, column: string) {
  if (!field.derived_from || !field.component) {
    return `json_extract(${column}, '${jsonPath(field, "value")}')`;
  }
  const display = `trim(json_extract(${column}, '${jsonPath(field, "display")}'))`;
  const delimiter = `instr(${display}, '-')`;
  const part = field.component === "made"
    ? `trim(substr(${display}, 1, ${delimiter} - 1))`
    : `trim(substr(${display}, ${delimiter} + 1))`;
  return `CASE WHEN ${delimiter} > 1 AND ${part} <> '' AND ${part} NOT GLOB '*[^0-9.]*' AND (length(${part}) - length(replace(${part}, '.', ''))) <= 1 THEN CAST(${part} AS REAL) END`;
}

function displayExpression(field: PublisherField, column: string) {
  return `json_extract(${column}, '${jsonPath(field, "display")}')`;
}

function completenessExpression(field: PublisherField, column: string) {
  if (field.derived_from) return numericExpression(field, column);
  return field.unit === "text"
    ? displayExpression(field, column)
    : numericExpression(field, column);
}

const querySchema = z.object({
  season: z.coerce.number().int().min(2024).max(2035).default(2026),
  category: z.enum(["averages", "totals", "miscellaneous"]).default("averages"),
  stat: z.string().regex(/^[A-Za-z0-9-]{1,80}$/).default("avgPoints"),
  q: z.string().trim().max(120).optional(),
  min_games: z.coerce.number().int().min(0).max(50).default(0),
  page: z.coerce.number().int().min(0).max(250).default(0),
  direction: z.enum(["desc", "asc"]).default("desc"),
  meta: z.enum(["0", "1"]).default("0"),
});

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("publisher statistics query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

export const publisherStats = new Hono<{ Bindings: Bindings }>();

publisherStats.get("/", zValidator("query", querySchema), async (c) => {
  const { season, category, stat, q, min_games, page, direction, meta } = c.req.valid("query");
  const db = researchDb(c.env);
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
  if (meta === "1") {
    try {
      // Publish field-level completeness from the same retained edition used
      // by the row browser. A field can exist in the schema while remaining
      // absent for some or every player, so the catalog must not imply that a
      // listed field has complete values. Compound made-attempted fields use
      // their source display string, matching the row endpoint.
      const coverageColumns = PUBLISHER_FIELDS.map((field, index) =>
        `sum(CASE WHEN ${completenessExpression(field, "stats_json")} IS NOT NULL THEN 1 ELSE 0 END) AS field_${index}`
      ).join(",");
      const [seasons, coverageRow] = await withTimeout(Promise.all([
        db.prepare(
          "SELECT DISTINCT season FROM bb_player_season ORDER BY season DESC",
        ).all<{ season: number }>(),
        db.prepare(
          `SELECT count(*) AS records,${coverageColumns} FROM bb_player_season WHERE season=?`,
        ).bind(season).first<Record<string, number | null>>(),
      ]), DB_TIMEOUT_MS);
      const records = Number(coverageRow?.records || 0);
      const coverage: PublisherFieldCoverage[] = PUBLISHER_FIELDS.map((field, index) => {
        const observed = Number(coverageRow?.[`field_${index}`] || 0);
        return {
          category: field.category,
          key: field.key,
          observed,
          missing: Math.max(0, records - observed),
          share: records ? observed / records : null,
        };
      });
      const response = c.json({
        season,
        seasons: seasons.results.map((row) => row.season),
        records,
        fields: PUBLISHER_FIELDS,
        coverage,
      });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
      return response;
    } catch {
      return c.json({ error: "The source-field catalog is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
  }
  const field = PUBLISHER_FIELDS.find((candidate) => candidate.category === category && candidate.key === stat);
  if (!field) return c.json({ error: "Unknown publisher field" }, 400);
  const valueSql = numericExpression(field, "s.stats_json");
  const displaySql = displayExpression(field, "s.stats_json");
  const search = q ? `%${q}%` : null;
  const conditions = ["s.season=?"];
  const binds: Array<string | number> = [season];
  if (search) {
    conditions.push("(p.name LIKE ? OR COALESCE(r.team_name,s.team_id) LIKE ? OR s.athlete_id LIKE ?)");
    binds.push(search, search, search);
  }
  if (min_games > 0) {
    conditions.push("COALESCE(json_extract(s.stats_json, '$.averages.gamesPlayed.value'), 0) >= ?");
    binds.push(min_games);
  }
  const where = conditions.join(" AND ");
  // Raw compound fields count their publisher display string. Parsed
  // components count only valid numeric halves, so malformed pairs remain
  // missing rather than silently becoming zero.
  const completenessSql = completenessExpression(field, "s.stats_json");
  try {
  const count = await withTimeout(db.prepare(
    `SELECT count(*) AS total, count(${completenessSql}) AS non_null
       FROM bb_player_season s
       LEFT JOIN bb_players p ON p.id=s.athlete_id
       LEFT JOIN (SELECT season,team_id,athlete_id,json_extract(profile_json,'$.team_display_name') AS team_name
                  FROM bb_rosters WHERE season=? GROUP BY season,team_id,athlete_id) r
         ON r.season=s.season AND r.team_id=s.team_id AND r.athlete_id=s.athlete_id
      WHERE ${where}`,
  ).bind(season, ...binds).first<{ total: number; non_null: number }>(), DB_TIMEOUT_MS);
  const order = field.unit === "text" && !field.derived_from
    ? "p.name ASC, s.athlete_id ASC"
    : `${valueSql} IS NULL, ${valueSql} ${direction === "asc" ? "ASC" : "DESC"}, p.name ASC, s.athlete_id ASC`;
  const rows = await withTimeout(db.prepare(
    `SELECT s.athlete_id AS id,p.name,p.position,s.team_id,
            COALESCE(r.team_name,s.team_id) AS team,
            ${valueSql} AS value,
            ${displaySql} AS display,
            json_extract(s.stats_json, '$.averages.gamesPlayed.value') AS games
       FROM bb_player_season s
       LEFT JOIN bb_players p ON p.id=s.athlete_id
       LEFT JOIN (SELECT season,team_id,athlete_id,json_extract(profile_json,'$.team_display_name') AS team_name
                  FROM bb_rosters WHERE season=? GROUP BY season,team_id,athlete_id) r
         ON r.season=s.season AND r.team_id=s.team_id AND r.athlete_id=s.athlete_id
      WHERE ${where}
      ORDER BY ${order} LIMIT 40 OFFSET ?`,
  ).bind(season, ...binds, page * 40).all(), DB_TIMEOUT_MS);
  const receipts = await withTimeout(db.prepare(
    "SELECT dataset,season,receipt_json FROM bb_sources WHERE dataset='player_season' AND season=? ORDER BY dataset,season",
  ).bind(season).all<{ dataset: string; season: number; receipt_json: string }>(), DB_TIMEOUT_MS);
  const sourceReceipts = receipts.results.flatMap((row) => {
    try {
      const receipt = JSON.parse(row.receipt_json) as { url?: unknown; fetched_at?: unknown; sha256?: unknown };
      if (typeof receipt.url !== "string" || typeof receipt.fetched_at !== "string" || typeof receipt.sha256 !== "string") return [];
      return [{ dataset: row.dataset, season: row.season, url: receipt.url, fetched_at: receipt.fetched_at, sha256: receipt.sha256 }];
    } catch {
      return [];
    }
  });
  const response = c.json({
    season,
    field,
    page,
    page_size: 40,
    total: count?.total ?? 0,
    non_null: count?.non_null ?? 0,
    source_receipts: sourceReceipts,
    rows: rows.results.map((row) => ({
      ...row,
      value: typeof row.value === "number" ? row.value : null,
      display: row.display == null ? null : String(row.display),
      games: typeof row.games === "number" ? row.games : null,
    })),
  });
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
  } catch {
    return c.json({ error: "The source statistics archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
