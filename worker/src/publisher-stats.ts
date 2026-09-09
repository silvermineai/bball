import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

export type PublisherField = {
  category: "averages" | "totals" | "miscellaneous";
  key: string;
  label: string;
  unit: "per game" | "percent" | "count" | "ratio" | "text";
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
}));

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

export const publisherStats = new Hono<{ Bindings: Bindings }>();

publisherStats.get("/", zValidator("query", querySchema), async (c) => {
  const { season, category, stat, q, min_games, page, direction, meta } = c.req.valid("query");
  if (meta === "1") {
    const seasons = await c.env.DB.prepare(
      "SELECT DISTINCT season FROM bb_player_season ORDER BY season DESC",
    ).all<{ season: number }>();
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ seasons: seasons.results.map((row) => row.season), fields: PUBLISHER_FIELDS });
  }
  const field = PUBLISHER_FIELDS.find((candidate) => candidate.category === category && candidate.key === stat);
  if (!field) return c.json({ error: "Unknown publisher field" }, 400);
  const valuePath = `$.${field.category}.${field.key}.value`;
  const displayPath = `$.${field.category}.${field.key}.display`;
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
  // Compound made-attempted fields intentionally retain their publisher
  // display string instead of inventing a numeric value. Count that display
  // path for completeness so the browser reflects the source rows accurately.
  const completenessPath = field.unit === "text" ? displayPath : valuePath;
  const count = await c.env.DB.prepare(
    `SELECT count(*) AS total, count(json_extract(s.stats_json, ?)) AS non_null
       FROM bb_player_season s
       LEFT JOIN bb_players p ON p.id=s.athlete_id
       LEFT JOIN (SELECT season,team_id,athlete_id,json_extract(profile_json,'$.team_display_name') AS team_name
                  FROM bb_rosters WHERE season=? GROUP BY season,team_id,athlete_id) r
         ON r.season=s.season AND r.team_id=s.team_id AND r.athlete_id=s.athlete_id
      WHERE ${where}`,
  ).bind(completenessPath, season, ...binds).first<{ total: number; non_null: number }>();
  const order = field.unit === "text"
    ? "p.name ASC, s.athlete_id ASC"
    : `json_extract(s.stats_json, '${valuePath}') IS NULL, json_extract(s.stats_json, '${valuePath}') ${direction === "asc" ? "ASC" : "DESC"}, p.name ASC, s.athlete_id ASC`;
  const rows = await c.env.DB.prepare(
    `SELECT s.athlete_id AS id,p.name,p.position,s.team_id,
            COALESCE(r.team_name,s.team_id) AS team,
            json_extract(s.stats_json, '${valuePath}') AS value,
            json_extract(s.stats_json, '${displayPath}') AS display,
            json_extract(s.stats_json, '$.averages.gamesPlayed.value') AS games
       FROM bb_player_season s
       LEFT JOIN bb_players p ON p.id=s.athlete_id
       LEFT JOIN (SELECT season,team_id,athlete_id,json_extract(profile_json,'$.team_display_name') AS team_name
                  FROM bb_rosters WHERE season=? GROUP BY season,team_id,athlete_id) r
         ON r.season=s.season AND r.team_id=s.team_id AND r.athlete_id=s.athlete_id
      WHERE ${where}
      ORDER BY ${order} LIMIT 40 OFFSET ?`,
  ).bind(season, ...binds, page * 40).all();
  const receipts = await c.env.DB.prepare(
    "SELECT dataset,season,receipt_json FROM bb_sources WHERE dataset='player_season' AND season=? ORDER BY dataset,season",
  ).bind(season).all<{ dataset: string; season: number; receipt_json: string }>();
  const sourceReceipts = receipts.results.flatMap((row) => {
    try {
      const receipt = JSON.parse(row.receipt_json) as { url?: unknown; fetched_at?: unknown; sha256?: unknown };
      if (typeof receipt.url !== "string" || typeof receipt.fetched_at !== "string" || typeof receipt.sha256 !== "string") return [];
      return [{ dataset: row.dataset, season: row.season, url: receipt.url, fetched_at: receipt.fetched_at, sha256: receipt.sha256 }];
    } catch {
      return [];
    }
  });
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
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
});
