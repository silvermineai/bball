import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
const metrics = ["ppg", "rpg", "apg", "spg", "bpg", "ts", "efg", "per40"] as const;
type Metric = (typeof metrics)[number];
const querySchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026).default(2026),
  metric: z.enum(metrics).default("ppg"),
  minGames: z.coerce.number().int().min(1).max(40).default(5),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

export const ncaaPlayerRankings = new Hono<{ Bindings: Bindings }>();

const aggregate = (where: string) => `
  SELECT season, player_id, team_id,
    MAX(player_name) AS player_name, MAX(team_name) AS team_name,
    MAX(opponent_name) AS opponent_name, COUNT(DISTINCT contest_id) AS games,
    SUM(COALESCE(CAST(json_extract(stats_json,'$.mins') AS REAL),0)) AS minutes,
    SUM(COALESCE(CAST(json_extract(stats_json,'$.pts') AS REAL),0)) AS points,
    SUM(COALESCE(CAST(json_extract(stats_json,'$.orb') AS REAL),0) + COALESCE(CAST(json_extract(stats_json,'$.drb') AS REAL),0)) AS rebounds,
    SUM(COALESCE(CAST(json_extract(stats_json,'$.ast') AS REAL),0)) AS assists,
    SUM(COALESCE(CAST(json_extract(stats_json,'$.stl') AS REAL),0)) AS steals,
    SUM(COALESCE(CAST(json_extract(stats_json,'$.blk') AS REAL),0)) AS blocks,
    SUM(COALESCE(CAST(json_extract(stats_json,'$.fga') AS REAL),0)) AS fga,
    SUM(COALESCE(CAST(json_extract(stats_json,'$.fgm') AS REAL),0)) AS fgm,
    SUM(COALESCE(CAST(json_extract(stats_json,'$.tpa') AS REAL),0)) AS tpa,
    SUM(COALESCE(CAST(json_extract(stats_json,'$.tpm') AS REAL),0)) AS tpm,
    SUM(COALESCE(CAST(json_extract(stats_json,'$.fta') AS REAL),0)) AS fta
  FROM bb_ncaa_player_season WHERE ${where}
  GROUP BY season, player_id, team_id`;

const metricExpression = (metric: Metric) => ({
  ppg: "points / games",
  rpg: "rebounds / games",
  apg: "assists / games",
  spg: "steals / games",
  bpg: "blocks / games",
  ts: "CASE WHEN (fga + 0.475 * fta) > 0 THEN 100.0 * points / (2 * (fga + 0.475 * fta)) ELSE NULL END",
  efg: "CASE WHEN fga > 0 THEN 100.0 * (fgm + 0.5 * tpm) / fga ELSE NULL END",
  per40: "CASE WHEN minutes > 0 THEN 40.0 * points / minutes ELSE NULL END",
}[metric]);

ncaaPlayerRankings.get("/", zValidator("query", querySchema), async (c) => {
  const { season, metric, minGames, q, page, meta } = c.req.valid("query");
  if (meta === "1") {
    const seasons = await c.env.DB.prepare("SELECT DISTINCT season FROM bb_ncaa_player_box ORDER BY season DESC").all<{ season: number }>();
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ seasons: seasons.results.map((row) => row.season), metrics });
  }
  const clauses = ["season=?"];
  const binds: Array<string | number> = [season];
  if (q) {
    clauses.push("(player_name LIKE ? OR team_name LIKE ? OR player_id LIKE ? OR team_id LIKE ?)");
    const search = `%${q}%`;
    binds.push(search, search, search, search);
  }
  const where = clauses.join(" AND ");
  const expression = metricExpression(metric);
  const count = await c.env.DB.prepare(
    `SELECT count(*) AS total FROM (${aggregate(where)}) a WHERE a.games >= ? AND (${expression}) IS NOT NULL`,
  ).bind(...binds, minGames).first<{ total: number }>();
  const rows = await c.env.DB.prepare(
    `WITH aggregate AS (${aggregate(where)}), ranked AS (
      SELECT aggregate.*, ${expression} AS value
      FROM aggregate WHERE games >= ?
    )
    SELECT *, RANK() OVER (ORDER BY value DESC) AS rank FROM ranked
    WHERE value IS NOT NULL ORDER BY value DESC, player_name ASC, player_id ASC
    LIMIT 50 OFFSET ?`,
  ).bind(...binds, minGames, page * 50).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ season, metric, min_games: minGames, page, page_size: 50, total: Number(count?.total || 0), rows: rows.results });
});
