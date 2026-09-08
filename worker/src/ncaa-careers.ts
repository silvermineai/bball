import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
const metrics = ["points", "ppg", "rpg", "apg", "minutes", "ts"] as const;
type Metric = (typeof metrics)[number];
const querySchema = z.object({
  fromSeason: z.coerce.number().int().min(2010).max(2026).default(2010),
  toSeason: z.coerce.number().int().min(2010).max(2026).default(2026),
  metric: z.enum(metrics).default("points"),
  minGames: z.coerce.number().int().min(1).max(500).default(20),
  minMinutes: z.coerce.number().int().min(0).max(3000).default(200),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

export const ncaaCareers = new Hono<{ Bindings: Bindings }>();

const metricExpression = (metric: Metric) => ({
  points: "points",
  ppg: "points / games",
  rpg: "rebounds / games",
  apg: "assists / games",
  minutes: "minutes",
  ts: "CASE WHEN (fga + 0.475 * fta) > 0 THEN 100.0 * points / (2 * (fga + 0.475 * fta)) ELSE NULL END",
}[metric]);

ncaaCareers.get("/", zValidator("query", querySchema), async (c) => {
  const { fromSeason, toSeason, metric, minGames, minMinutes, q, page, meta } = c.req.valid("query");
  if (fromSeason > toSeason) return c.json({ error: "fromSeason must be no later than toSeason" }, 400);
  if (meta === "1") {
    const seasons = await c.env.DB.prepare("SELECT DISTINCT season FROM bb_ncaa_player_season ORDER BY season DESC").all<{ season: number }>();
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ seasons: seasons.results.map((row) => row.season), metrics });
  }
  const clauses = ["season BETWEEN ? AND ?"];
  const binds: Array<string | number> = [fromSeason, toSeason];
  if (q) {
    clauses.push("(player_name LIKE ? OR team_name LIKE ? OR player_id LIKE ?)");
    const search = `%${q}%`;
    binds.push(search, search, search);
  }
  const where = clauses.join(" AND ");
  const aggregate = `
    SELECT season, player_id, team_id, player_name, team_name, games,
      COALESCE(CAST(json_extract(stats_json,'$.mins') AS REAL),0) AS minutes,
      COALESCE(CAST(json_extract(stats_json,'$.pts') AS REAL),0) AS points,
      COALESCE(CAST(json_extract(stats_json,'$.orb') AS REAL),0) + COALESCE(CAST(json_extract(stats_json,'$.drb') AS REAL),0) AS rebounds,
      COALESCE(CAST(json_extract(stats_json,'$.ast') AS REAL),0) AS assists,
      COALESCE(CAST(json_extract(stats_json,'$.fga') AS REAL),0) AS fga,
      COALESCE(CAST(json_extract(stats_json,'$.fta') AS REAL),0) AS fta
    FROM bb_ncaa_player_season WHERE ${where}`;
  const value = metricExpression(metric);
  const qualification = `games >= ? AND minutes >= ? AND (${value}) IS NOT NULL`;
  const count = await c.env.DB.prepare(`SELECT count(*) AS total FROM (${aggregate}) historical WHERE ${qualification}`).bind(...binds, minGames, minMinutes).first<{ total: number }>();
  const rows = await c.env.DB.prepare(`WITH historical AS (${aggregate}), ranked AS (
      SELECT historical.*, ${value} AS value FROM historical WHERE ${qualification}
    ) SELECT *, RANK() OVER (ORDER BY value DESC) AS rank FROM ranked
    ORDER BY value DESC, player_name ASC, player_id ASC LIMIT 50 OFFSET ?`).bind(...binds, minGames, minMinutes, page * 50).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ from_season: fromSeason, to_season: toSeason, metric, min_games: minGames, min_minutes: minMinutes, page, page_size: 50, total: Number(count?.total || 0), rows: rows.results });
});
