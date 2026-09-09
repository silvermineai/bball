import { researchDb } from "./research-db";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
const metrics = [
  "points",
  "ppg",
  "rpg",
  "apg",
  "minutes",
  "ts",
  "efg",
  "three_pct",
  "ft_pct",
  "per40",
  "stocks40",
  "ast_to",
  "tov_rate",
  "three_rate",
  "orb40",
  "drb40",
  "reb40",
] as const;
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
  efg: "CASE WHEN fga > 0 THEN 100.0 * (fgm + 0.5 * tpm) / fga ELSE NULL END",
  three_pct: "CASE WHEN tpa > 0 THEN 100.0 * tpm / tpa ELSE NULL END",
  ft_pct: "CASE WHEN fta > 0 THEN 100.0 * ftm / fta ELSE NULL END",
  per40: "CASE WHEN minutes > 0 THEN 40.0 * points / minutes ELSE NULL END",
  stocks40: "CASE WHEN minutes > 0 THEN 40.0 * (steals + blocks) / minutes ELSE NULL END",
  ast_to: "CASE WHEN turnovers > 0 THEN assists / turnovers ELSE NULL END",
  tov_rate: "CASE WHEN possessions > 0 THEN 100.0 * turnovers / possessions ELSE NULL END",
  three_rate: "CASE WHEN fga > 0 THEN 100.0 * tpa / fga ELSE NULL END",
  orb40: "CASE WHEN minutes > 0 THEN 40.0 * offensive_rebounds / minutes ELSE NULL END",
  drb40: "CASE WHEN minutes > 0 THEN 40.0 * defensive_rebounds / minutes ELSE NULL END",
  reb40: "CASE WHEN minutes > 0 THEN 40.0 * rebounds / minutes ELSE NULL END",
}[metric]);

ncaaCareers.get("/", zValidator("query", querySchema), async (c) => {
  const { fromSeason, toSeason, metric, minGames, minMinutes, q, page, meta } = c.req.valid("query");
  if (fromSeason > toSeason) return c.json({ error: "fromSeason must be no later than toSeason" }, 400);
  if (meta === "1") {
    const seasons = await researchDb(c.env).prepare("SELECT DISTINCT season FROM bb_ncaa_player_season ORDER BY season DESC").all<{ season: number }>();
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
      COALESCE(CAST(json_extract(stats_json,'$.orb') AS REAL),0) AS offensive_rebounds,
      COALESCE(CAST(json_extract(stats_json,'$.drb') AS REAL),0) AS defensive_rebounds,
      COALESCE(CAST(json_extract(stats_json,'$.ast') AS REAL),0) AS assists,
      COALESCE(CAST(json_extract(stats_json,'$.tov') AS REAL),0) AS turnovers,
      COALESCE(CAST(json_extract(stats_json,'$.o_poss') AS REAL),0) AS possessions,
      COALESCE(CAST(json_extract(stats_json,'$.stl') AS REAL),0) AS steals,
      COALESCE(CAST(json_extract(stats_json,'$.blk') AS REAL),0) AS blocks,
      COALESCE(CAST(json_extract(stats_json,'$.fga') AS REAL),0) AS fga,
      COALESCE(CAST(json_extract(stats_json,'$.fgm') AS REAL),0) AS fgm,
      COALESCE(CAST(json_extract(stats_json,'$.tpa') AS REAL),0) AS tpa,
      COALESCE(CAST(json_extract(stats_json,'$.tpm') AS REAL),0) AS tpm,
      COALESCE(CAST(json_extract(stats_json,'$.fta') AS REAL),0) AS fta,
      COALESCE(CAST(json_extract(stats_json,'$.ftm') AS REAL),0) AS ftm
    FROM bb_ncaa_player_season WHERE ${where}`;
  const value = metricExpression(metric);
  const qualification = `games >= ? AND minutes >= ? AND (${value}) IS NOT NULL`;
  const count = await researchDb(c.env).prepare(`SELECT count(*) AS total FROM (${aggregate}) historical WHERE ${qualification}`).bind(...binds, minGames, minMinutes).first<{ total: number }>();
  const rows = await researchDb(c.env).prepare(`WITH historical AS (${aggregate}), ranked AS (
      SELECT historical.*, ${value} AS value FROM historical WHERE ${qualification}
    ) SELECT *, RANK() OVER (ORDER BY value DESC) AS rank FROM ranked
    ORDER BY value DESC, player_name ASC, player_id ASC LIMIT 50 OFFSET ?`).bind(...binds, minGames, minMinutes, page * 50).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ from_season: fromSeason, to_season: toSeason, metric, min_games: minGames, min_minutes: minMinutes, page, page_size: 50, total: Number(count?.total || 0), rows: rows.results });
});
