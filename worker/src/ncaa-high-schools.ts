import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
const metrics = ["players", "programs", "games", "points", "ppg"] as const;
type Metric = (typeof metrics)[number];
const querySchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026).default(2026),
  metric: z.enum(metrics).default("players"),
  minPlayers: z.coerce.number().int().min(1).max(20).default(1),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

export const ncaaHighSchools = new Hono<{ Bindings: Bindings }>();

const metricExpression = (metric: Metric) => ({
  players: "players",
  programs: "programs",
  games: "games",
  points: "points",
  ppg: "CASE WHEN games > 0 THEN points / games ELSE NULL END",
}[metric]);

ncaaHighSchools.get("/", zValidator("query", querySchema), async (c) => {
  const { season, metric, minPlayers, q, page, meta } = c.req.valid("query");
  if (meta === "1") {
    const [seasons, schools] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT DISTINCT season FROM bb_ncaa_rosters ORDER BY season DESC"),
      c.env.DB.prepare("SELECT count(DISTINCT json_extract(profile_json,'$.high_school')) AS total FROM bb_ncaa_rosters WHERE season=? AND json_extract(profile_json,'$.high_school') IS NOT NULL AND json_extract(profile_json,'$.high_school') != ''").bind(season),
    ]);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ seasons: seasons.results.map((row) => Number((row as { season: number }).season)), total: Number((schools.results[0] as { total: number }).total || 0), metrics });
  }
  const clauses = ["r.season=?", "json_extract(r.profile_json,'$.high_school') IS NOT NULL", "json_extract(r.profile_json,'$.high_school') != ''"];
  const binds: Array<string | number> = [season];
  if (q) {
    clauses.push("json_extract(r.profile_json,'$.high_school') LIKE ?");
    binds.push(`%${q}%`);
  }
  const where = clauses.join(" AND ");
  const aggregate = `
    SELECT json_extract(r.profile_json,'$.high_school') AS high_school,
      COUNT(DISTINCT r.player_id) AS players,
      COUNT(DISTINCT r.team_id) AS programs,
      SUM(COALESCE(p.games,0)) AS games,
      SUM(COALESCE(p.points,0)) AS points
    FROM bb_ncaa_rosters r
    LEFT JOIN (
      SELECT season,player_id,team_id,
        SUM(games) AS games,
        SUM(COALESCE(CAST(json_extract(stats_json,'$.pts') AS REAL),0)) AS points
      FROM bb_ncaa_player_season GROUP BY season,player_id,team_id
    ) p ON p.season=r.season AND p.player_id=r.player_id AND p.team_id=r.team_id
    WHERE ${where}
    GROUP BY json_extract(r.profile_json,'$.high_school')`;
  const value = metricExpression(metric);
  const count = await c.env.DB.prepare(`SELECT count(*) AS total FROM (${aggregate}) schools WHERE players >= ? AND (${value}) IS NOT NULL`).bind(...binds, minPlayers).first<{ total: number }>();
  const rows = await c.env.DB.prepare(`WITH schools AS (${aggregate}), ranked AS (
      SELECT schools.*, ${value} AS value FROM schools WHERE players >= ?
    ) SELECT *, RANK() OVER (ORDER BY value DESC) AS rank FROM ranked
    WHERE value IS NOT NULL ORDER BY value DESC, high_school ASC LIMIT 50 OFFSET ?`).bind(...binds, minPlayers, page * 50).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ season, metric, min_players: minPlayers, page, page_size: 50, total: Number(count?.total || 0), rows: rows.results });
});
