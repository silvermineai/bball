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
    `SELECT season,team_id,player_id,team_name,player_name,profile_json
     FROM bb_ncaa_rosters WHERE ${where}
     ORDER BY player_name ASC, team_name ASC, player_id ASC LIMIT 40 OFFSET ?`,
  ).bind(...binds, page * 40).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ season, page, page_size: 40, total: Number(count?.total || 0), rows: rows.results.map(({ profile_json, ...row }) => ({ ...row, profile: JSON.parse(String(profile_json)) })) });
});
