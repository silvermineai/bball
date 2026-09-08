import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
export type TeamField = {
  category: "general" | "offensive" | "defensive";
  key: string;
  label: string;
  unit: "per game" | "percent" | "count" | "ratio";
};

const fields: TeamField[] = ([
  ["general", "assistTurnoverRatio", "Assist-to-turnover ratio", "ratio"],
  ["general", "avgFouls", "Fouls per game", "per game"],
  ["general", "avgMinutes", "Minutes per game", "per game"],
  ["general", "avgRebounds", "Rebounds per game", "per game"],
  ["general", "gamesPlayed", "Games played", "count"],
  ["general", "gamesStarted", "Games started", "count"],
  ["general", "minutes", "Minutes", "count"],
  ["general", "rebounds", "Rebounds", "count"],
  ["general", "totalRebounds", "Total rebounds", "count"],
  ["offensive", "assists", "Assists", "count"],
  ["offensive", "avgAssists", "Assists per game", "per game"],
  ["offensive", "avgFieldGoalsAttempted", "Field goals attempted per game", "per game"],
  ["offensive", "avgFieldGoalsMade", "Field goals made per game", "per game"],
  ["offensive", "avgFreeThrowsAttempted", "Free throws attempted per game", "per game"],
  ["offensive", "avgFreeThrowsMade", "Free throws made per game", "per game"],
  ["offensive", "avgOffensiveRebounds", "Offensive rebounds per game", "per game"],
  ["offensive", "avgPoints", "Points per game", "per game"],
  ["offensive", "avgThreePointFieldGoalsAttempted", "3-point attempts per game", "per game"],
  ["offensive", "avgThreePointFieldGoalsMade", "3-pointers made per game", "per game"],
  ["offensive", "avgTurnovers", "Turnovers per game", "per game"],
  ["offensive", "avgTwoPointFieldGoalsAttempted", "2-point attempts per game", "per game"],
  ["offensive", "avgTwoPointFieldGoalsMade", "2-pointers made per game", "per game"],
  ["offensive", "fieldGoalPct", "Field-goal percentage", "percent"],
  ["offensive", "fieldGoalsAttempted", "Field goals attempted", "count"],
  ["offensive", "fieldGoalsMade", "Field goals made", "count"],
  ["offensive", "freeThrowPct", "Free-throw percentage", "percent"],
  ["offensive", "freeThrowsAttempted", "Free throws attempted", "count"],
  ["offensive", "freeThrowsMade", "Free throws made", "count"],
  ["offensive", "offensiveRebounds", "Offensive rebounds", "count"],
  ["offensive", "points", "Points", "count"],
  ["offensive", "scoringEfficiency", "Scoring efficiency", "ratio"],
  ["offensive", "shootingEfficiency", "Shooting efficiency", "ratio"],
  ["offensive", "threePointFieldGoalPct", "3-point percentage", "percent"],
  ["offensive", "threePointFieldGoalsAttempted", "3-point attempts", "count"],
  ["offensive", "threePointFieldGoalsMade", "3-pointers made", "count"],
  ["offensive", "turnovers", "Turnovers", "count"],
  ["offensive", "twoPointFieldGoalPct", "2-point percentage", "percent"],
  ["offensive", "twoPointFieldGoalsAttempted", "2-point attempts", "count"],
  ["offensive", "twoPointFieldGoalsMade", "2-pointers made", "count"],
  ["defensive", "avgBlocks", "Blocks per game", "per game"],
  ["defensive", "avgDefensiveRebounds", "Defensive rebounds per game", "per game"],
  ["defensive", "avgSteals", "Steals per game", "per game"],
  ["defensive", "blocks", "Blocks", "count"],
  ["defensive", "defensiveRebounds", "Defensive rebounds", "count"],
  ["defensive", "steals", "Steals", "count"],
] as Array<[TeamField["category"], string, string, TeamField["unit"]]>).map(([category, key, label, unit]) => ({ category, key, label, unit }));

const querySchema = z.object({
  season: z.coerce.number().int().min(2024).max(2026).default(2026),
  category: z.enum(["general", "offensive", "defensive"]).default("offensive"),
  stat: z.string().regex(/^[A-Za-z0-9]{1,80}$/).default("avgPoints"),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(250).default(0),
  direction: z.enum(["desc", "asc"]).default("desc"),
  meta: z.enum(["0", "1"]).default("0"),
});

export const teamStats = new Hono<{ Bindings: Bindings }>();
teamStats.get("/", zValidator("query", querySchema), async (c) => {
  const { season, category, stat, q, page, direction, meta } = c.req.valid("query");
  if (meta === "1") {
    const seasons = await c.env.DB.prepare("SELECT DISTINCT season FROM bb_team_season ORDER BY season DESC").all<{ season: number }>();
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ seasons: seasons.results.map((row) => row.season), fields });
  }
  const field = fields.find((candidate) => candidate.category === category && candidate.key === stat);
  if (!field) return c.json({ error: "Unknown team source field" }, 400);
  const valuePath = `$.${field.category}.${field.key}.value`;
  const displayPath = `$.${field.category}.${field.key}.display`;
  const search = q ? `%${q}%` : null;
  const where = search ? "season=? AND (team_name LIKE ? OR team_id LIKE ?)" : "season=?";
  const binds: Array<string | number> = search ? [season, search, search] : [season];
  const count = await c.env.DB.prepare(
    `SELECT count(*) AS total, count(json_extract(stats_json, ?)) AS non_null FROM bb_team_season WHERE ${where}`,
  ).bind(valuePath, ...binds).first<{ total: number; non_null: number }>();
  const order = `json_extract(stats_json, '${valuePath}') IS NULL, json_extract(stats_json, '${valuePath}') ${direction === "asc" ? "ASC" : "DESC"}, team_name ASC, team_id ASC`;
  const rows = await c.env.DB.prepare(
    `SELECT team_id,team_name,team_abbreviation,
            json_extract(stats_json, '${valuePath}') AS value,
            json_extract(stats_json, '${displayPath}') AS display
       FROM bb_team_season WHERE ${where}
      ORDER BY ${order} LIMIT 40 OFFSET ?`,
  ).bind(...binds, page * 40).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    season, field, page, page_size: 40,
    total: count?.total ?? 0, non_null: count?.non_null ?? 0,
    rows: rows.results.map((row) => ({
      id: row.team_id, team: row.team_name || row.team_id, abbreviation: row.team_abbreviation,
      value: typeof row.value === "number" ? row.value : null,
      display: row.display == null ? null : String(row.display),
    })),
  });
});
