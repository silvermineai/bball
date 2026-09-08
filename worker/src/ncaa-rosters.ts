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

export const ncaaRosters = new Hono<{ Bindings: Bindings }>();

ncaaRosters.get("/", zValidator("query", querySchema), async (c) => {
  const { season, q, classYear, position, page, meta } = c.req.valid("query");
  if (meta === "1") {
    const [seasons, classes, positions, count] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT DISTINCT season FROM bb_ncaa_rosters ORDER BY season DESC"),
      c.env.DB.prepare("SELECT DISTINCT json_extract(profile_json,'$.class') AS value FROM bb_ncaa_rosters WHERE season=? AND value IS NOT NULL AND value != '' ORDER BY value").bind(season),
      c.env.DB.prepare("SELECT DISTINCT json_extract(profile_json,'$.position') AS value FROM bb_ncaa_rosters WHERE season=? AND value IS NOT NULL AND value != '' ORDER BY value").bind(season),
      c.env.DB.prepare("SELECT count(*) AS total FROM bb_ncaa_rosters WHERE season=?").bind(season),
    ]);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
      classes: classes.results.map((row) => String((row as { value: string }).value)),
      positions: positions.results.map((row) => String((row as { value: string }).value)),
      total: Number((count.results[0] as { total: number }).total || 0),
    });
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
  const count = await c.env.DB.prepare(`SELECT count(*) AS total FROM bb_ncaa_rosters WHERE ${where}`).bind(...binds).first<{ total: number }>();
  const rows = await c.env.DB.prepare(
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
  ).bind(...binds, page * 40).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ season, page, page_size: 40, total: Number(count?.total || 0), rows: rows.results.map(({ profile_json, shooting_json, ...row }) => ({ ...row, profile: JSON.parse(String(profile_json)), shooting: shooting_json ? JSON.parse(String(shooting_json)) : null })) });
});
