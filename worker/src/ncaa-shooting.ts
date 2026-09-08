import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;
const metrics = ["volume", "fg_pct", "3p_pct", "rim_pct", "mid_pct", "distance"] as const;
type Metric = (typeof metrics)[number];
const querySchema = z.object({
  season: z.coerce.number().int().min(2019).max(2026).default(2026),
  metric: z.enum(metrics).default("volume"),
  minAttempts: z.coerce.number().int().min(1).max(2000).default(50),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});
const sourceSchema = z.object({
  season: z.coerce.number().int().min(2019).max(2026),
});

export const ncaaShooting = new Hono<{ Bindings: Bindings }>();
const expression = (metric: Metric) => ({
  volume: "json_extract(stats_json,'$.attempts')",
  fg_pct: "CASE WHEN json_extract(stats_json,'$.attempts') > 0 THEN 100.0 * json_extract(stats_json,'$.makes') / json_extract(stats_json,'$.attempts') END",
  "3p_pct": "CASE WHEN (COALESCE(json_extract(stats_json,'$.zones.abovebreak3.attempts'),0) + COALESCE(json_extract(stats_json,'$.zones.corner3.attempts'),0)) > 0 THEN 100.0 * (COALESCE(json_extract(stats_json,'$.zones.abovebreak3.makes'),0) + COALESCE(json_extract(stats_json,'$.zones.corner3.makes'),0)) / (COALESCE(json_extract(stats_json,'$.zones.abovebreak3.attempts'),0) + COALESCE(json_extract(stats_json,'$.zones.corner3.attempts'),0)) END",
  rim_pct: "CASE WHEN json_extract(stats_json,'$.zones.rim.attempts') > 0 THEN 100.0 * json_extract(stats_json,'$.zones.rim.makes') / json_extract(stats_json,'$.zones.rim.attempts') END",
  mid_pct: "CASE WHEN json_extract(stats_json,'$.zones.mid.attempts') > 0 THEN 100.0 * json_extract(stats_json,'$.zones.mid.makes') / json_extract(stats_json,'$.zones.mid.attempts') END",
  distance: "CASE WHEN json_extract(stats_json,'$.distance_count') > 0 THEN json_extract(stats_json,'$.distance_sum') / json_extract(stats_json,'$.distance_count') END",
}[metric]);
const qualification = (metric: Metric) => ({
  volume: "json_extract(stats_json,'$.attempts')",
  fg_pct: "json_extract(stats_json,'$.attempts')",
  "3p_pct": "COALESCE(json_extract(stats_json,'$.zones.abovebreak3.attempts'),0) + COALESCE(json_extract(stats_json,'$.zones.corner3.attempts'),0)",
  rim_pct: "COALESCE(json_extract(stats_json,'$.zones.rim.attempts'),0)",
  mid_pct: "COALESCE(json_extract(stats_json,'$.zones.mid.attempts'),0)",
  distance: "json_extract(stats_json,'$.distance_count')",
}[metric]);

/** Stream the exact NCAA shot release whose receipt is active in D1. */
ncaaShooting.get("/source", zValidator("query", sourceSchema), async (c) => {
  const { season } = c.req.valid("query");
  const row = await c.env.DB.prepare(
    "SELECT receipt_json FROM bb_sources WHERE dataset=? AND season=?",
  ).bind("ncaa_shots", season).first<{ receipt_json: string }>();
  let digest = "";
  try {
    const receipt = row?.receipt_json ? JSON.parse(row.receipt_json) as { sha256?: unknown } : null;
    digest = typeof receipt?.sha256 === "string" ? receipt.sha256 : "";
  } catch {
    return c.text("NCAA shooting source receipt is invalid", 503);
  }
  if (!/^[a-f0-9]{64}$/.test(digest)) return c.text("NCAA shooting source release not found", 404);
  const headers = new Headers({
    "Content-Type": "application/vnd.apache.parquet",
    "Content-Disposition": `attachment; filename="ncaa_mbb_shots_${season}.parquet"`,
    ETag: `"${digest}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, follow",
  });
  if (c.req.header("If-None-Match")?.split(",").map((tag) => tag.trim()).includes(`"${digest}"`)) return new Response(null, { status: 304, headers });
  const object = await c.env.RESEARCH_ARCHIVE.get(`basketball/ncaa-shots/${season}/${digest}.parquet`);
  if (!object || !("body" in object)) return c.text("NCAA shooting source release is temporarily unavailable", 503);
  return new Response(object.body, { headers });
});

ncaaShooting.get("/", zValidator("query", querySchema), async (c) => {
  const { season, metric, minAttempts, q, page, meta } = c.req.valid("query");
  if (meta === "1") {
    const [seasons, source] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT DISTINCT season FROM bb_ncaa_player_shooting ORDER BY season DESC"),
      c.env.DB.prepare("SELECT json_extract(receipt_json,'$.fetched_at') AS fetched_at, json_extract(receipt_json,'$.sha256') AS sha256 FROM bb_sources WHERE dataset='ncaa_shots' AND season=?").bind(season),
    ]);
    const sourceRow = source.results[0] as { fetched_at?: unknown; sha256?: unknown } | undefined;
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
      metrics,
      source: {
        fetched_at: typeof sourceRow?.fetched_at === "string" ? sourceRow.fetched_at : null,
        sha256: typeof sourceRow?.sha256 === "string" ? sourceRow.sha256 : null,
      },
    });
  }
  const clauses = ["season=?"];
  const binds: Array<string | number> = [season];
  if (q) {
    clauses.push("(player_name LIKE ? OR team_name LIKE ? OR player_id LIKE ? OR team_id LIKE ?)");
    const search = `%${q}%`;
    binds.push(search, search, search, search);
  }
  const where = clauses.join(" AND ");
  const value = expression(metric);
  const qualified = qualification(metric);
  const count = await c.env.DB.prepare(`SELECT count(*) AS total FROM bb_ncaa_player_shooting WHERE ${where} AND (${qualified}) >= ? AND (${value}) IS NOT NULL`).bind(...binds, minAttempts).first<{ total: number }>();
  const rows = await c.env.DB.prepare(`SELECT season,player_id,team_id,player_name,team_name,stats_json,${value} AS value FROM bb_ncaa_player_shooting WHERE ${where} AND (${qualified}) >= ? AND (${value}) IS NOT NULL ORDER BY value DESC,player_name ASC,player_id ASC LIMIT 40 OFFSET ?`).bind(...binds, minAttempts, page * 40).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ season, metric, min_attempts: minAttempts, page, page_size: 40, total: Number(count?.total || 0), rows: rows.results.map(({ stats_json, ...row }) => ({ ...row, stats: JSON.parse(String(stats_json)) })) });
});
