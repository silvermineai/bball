import { researchDb } from "./research-db";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const querySchema = z.object({
  season: z.coerce.number().int().min(2003).max(2026).default(2026),
  q: z.string().trim().max(120).optional(),
  position: z.string().trim().regex(/^[A-Za-z0-9 -]{0,40}$/).optional(),
  status: z.string().trim().regex(/^[A-Za-z0-9 _-]{0,40}$/).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  direction: z.enum(["asc", "desc"]).default("asc"),
  meta: z.enum(["0", "1"]).default("0"),
});

export const playerCore = new Hono<{ Bindings: Bindings }>();

playerCore.get("/", zValidator("query", querySchema), async (c) => {
  const { season, q, position, status, page, direction, meta } = c.req.valid("query");
  if (meta === "1") {
    const [seasons, positions, statuses, count, source] = await researchDb(c.env).batch([
      researchDb(c.env).prepare("SELECT DISTINCT season FROM bb_player_core ORDER BY season DESC"),
      researchDb(c.env).prepare("SELECT DISTINCT json_extract(profile_json,'$.position_name') AS value FROM bb_player_core WHERE season=? AND value IS NOT NULL AND value != '' ORDER BY value").bind(season),
      researchDb(c.env).prepare("SELECT DISTINCT json_extract(profile_json,'$.status_name') AS value FROM bb_player_core WHERE season=? AND value IS NOT NULL AND value != '' ORDER BY value").bind(season),
      researchDb(c.env).prepare("SELECT count(*) AS total FROM bb_player_core WHERE season=?").bind(season),
      researchDb(c.env).prepare("SELECT json_extract(receipt_json,'$.fetched_at') AS fetched_at, json_extract(receipt_json,'$.sha256') AS sha256 FROM bb_sources WHERE dataset='player_core' AND season=?").bind(season),
    ]);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
      positions: positions.results.map((row) => String((row as { value: string }).value)),
      statuses: statuses.results.map((row) => String((row as { value: string }).value)),
      total: Number((count.results[0] as { total: number }).total || 0),
      source: (() => {
        const row = source.results[0] as { fetched_at?: unknown; sha256?: unknown } | undefined;
        return {
          fetched_at: typeof row?.fetched_at === "string" ? row.fetched_at : null,
          sha256: typeof row?.sha256 === "string" ? row.sha256 : null,
        };
      })(),
    });
  }
  const clauses = ["season=?"];
  const binds: Array<string | number> = [season];
  if (q) {
    clauses.push("(json_extract(profile_json,'$.display_name') LIKE ? OR json_extract(profile_json,'$.full_name') LIKE ? OR json_extract(profile_json,'$.slug') LIKE ? OR athlete_id LIKE ?)");
    const search = `%${q}%`;
    binds.push(search, search, search, search);
  }
  if (position) {
    clauses.push("json_extract(profile_json,'$.position_name')=?");
    binds.push(position);
  }
  if (status) {
    clauses.push("json_extract(profile_json,'$.status_name')=?");
    binds.push(status);
  }
  const where = clauses.join(" AND ");
  const count = await researchDb(c.env).prepare(`SELECT count(*) AS total FROM bb_player_core WHERE ${where}`).bind(...binds).first<{ total: number }>();
  const order = direction === "desc" ? "DESC" : "ASC";
  const rowWhere = where
    .replaceAll("season=?", "bb_player_core.season=?")
    .replaceAll("athlete_id LIKE", "bb_player_core.athlete_id LIKE");
  const rows = await researchDb(c.env).prepare(
    `SELECT bb_player_core.season,bb_player_core.athlete_id AS id,
      json_extract(bb_player_core.profile_json,'$.display_name') AS name,
      json_extract(bb_player_core.profile_json,'$.position_name') AS position,
      json_extract(bb_player_core.profile_json,'$.display_height') AS height,
      json_extract(bb_player_core.profile_json,'$.display_weight') AS weight,
      json_extract(bb_player_core.profile_json,'$.jersey') AS jersey,
      json_extract(bb_player_core.profile_json,'$.experience_years') AS experience,
      json_extract(bb_player_core.profile_json,'$.status_name') AS status,
      json_extract(bb_player_core.profile_json,'$.current_team_id') AS team_id,
      COALESCE(r.team_name, json_extract(bb_player_core.profile_json,'$.current_team_id')) AS team,
      bb_player_core.profile_json
     FROM bb_player_core
     LEFT JOIN (
       SELECT season,athlete_id,
         MAX(json_extract(profile_json,'$.team_display_name')) AS team_name
       FROM bb_rosters WHERE season=? GROUP BY season,athlete_id
     ) r ON r.season=bb_player_core.season AND r.athlete_id=bb_player_core.athlete_id
     WHERE ${rowWhere}
     ORDER BY name ${order}, id ASC LIMIT 40 OFFSET ?`,
  ).bind(season, ...binds, page * 40).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    season,
    page,
    page_size: 40,
    total: count?.total ?? 0,
    rows: rows.results.map(({ profile_json, ...row }) => ({
      ...row,
      profile: JSON.parse(String(profile_json)),
    })),
  });
});
