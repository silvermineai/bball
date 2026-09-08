import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
type Metric = { key: string; label: string; unit: "points per 100 possessions" | "possessions per 40 minutes" | "rank" | "value" | "minutes" };
const ratingMetrics: Metric[] = [
  { key: "rank", label: "Publisher rank", unit: "rank" },
  { key: "adj_em", label: "Adjusted efficiency margin", unit: "points per 100 possessions" },
  { key: "adj_o", label: "Adjusted offense", unit: "points per 100 possessions" },
  { key: "adj_d", label: "Adjusted defense", unit: "points per 100 possessions" },
  { key: "adj_tempo", label: "Adjusted tempo", unit: "possessions per 40 minutes" },
];
const playerMetrics: Metric[] = [
  { key: "box_bpm", label: "Box Plus/Minus", unit: "value" },
  { key: "box_obpm", label: "Offensive BPM", unit: "value" },
  { key: "box_dbpm", label: "Defensive BPM", unit: "value" },
  { key: "min", label: "Recorded minutes", unit: "minutes" },
];
const querySchema = z.object({
  kind: z.enum(["ratings", "players"]).default("ratings"),
  season: z.coerce.number().int().min(2006).max(2026).default(2026),
  metric: z.string().regex(/^[a-z_]{2,20}$/).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(250).default(0),
  direction: z.enum(["desc", "asc"]).default("desc"),
  meta: z.enum(["0", "1"]).default("0"),
});

export const boutique = new Hono<{ Bindings: Bindings }>();
boutique.get("/", zValidator("query", querySchema), async (c) => {
  const { kind, season, metric: requestedMetric, q, page, direction, meta } = c.req.valid("query");
  const metrics = kind === "ratings" ? ratingMetrics : playerMetrics;
  if (meta === "1") {
    const seasons = await c.env.DB.prepare(
      `SELECT DISTINCT season FROM ${kind === "ratings" ? "bb_publisher_ratings" : "bb_player_value"} ORDER BY season DESC`,
    ).all<{ season: number }>();
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ kind, seasons: seasons.results.map((row) => row.season), metrics });
  }
  const metric = metrics.find((candidate) => candidate.key === (requestedMetric || metrics[0].key));
  if (!metric) return c.json({ error: "Unknown boutique metric" }, 400);
  const table = kind === "ratings" ? "bb_publisher_ratings" : "bb_player_value";
  const path = `$.${metric.key}`;
  const search = q ? `%${q}%` : null;
  const where = kind === "ratings"
    ? search ? "p.season=? AND (COALESCE(t.team_name,p.team_id) LIKE ? OR p.team_id LIKE ?)" : "p.season=?"
    : search ? "p.season=? AND (p.player_name LIKE ? OR COALESCE(t.team_name,p.team_id) LIKE ? OR p.player_id LIKE ?)" : "p.season=?";
  const binds: Array<string | number> = search
    ? kind === "ratings" ? [season, search, search] : [season, search, search, search]
    : [season];
  const count = await c.env.DB.prepare(
    `SELECT count(*) AS total, count(json_extract(p.stats_json, ?)) AS non_null FROM ${table} p LEFT JOIN bb_team_season t ON t.season=p.season AND t.team_id=p.team_id WHERE ${where}`,
  ).bind(path, ...binds).first<{ total: number; non_null: number }>();
  const order = `json_extract(p.stats_json, '${path}') IS NULL, json_extract(p.stats_json, '${path}') ${direction === "asc" ? "ASC" : "DESC"}, ${kind === "ratings" ? "COALESCE(t.team_name,p.team_id),p.team_id" : "p.player_name,p.player_id"}`;
  const select = kind === "ratings"
    ? `p.team_id AS id, COALESCE(t.team_name,p.team_id) AS team, t.team_abbreviation AS abbreviation, json_extract(p.stats_json, '${path}') AS value`
    : `p.player_id AS id, p.player_name AS player, p.team_id, COALESCE(t.team_name,p.team_id) AS team, json_extract(p.stats_json, '$.box_bpm') AS bpm, json_extract(p.stats_json, '${path}') AS value`;
  const rows = await c.env.DB.prepare(
    `SELECT ${select} FROM ${table} p LEFT JOIN bb_team_season t ON t.season=p.season AND t.team_id=p.team_id WHERE ${where} ORDER BY ${order} LIMIT 40 OFFSET ?`,
  ).bind(...binds, page * 40).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ kind, season, metric, page, page_size: 40, total: count?.total ?? 0, non_null: count?.non_null ?? 0, rows: rows.results });
});
