import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const querySchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026).default(2026),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(10000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});
const sourceSchema = z.object({
  season: z.coerce.number().int().min(2010).max(2026),
});

export const ncaaPlayerBox = new Hono<{ Bindings: Bindings }>();

ncaaPlayerBox.get("/source", zValidator("query", sourceSchema), async (c) => {
  const { season } = c.req.valid("query");
  const catalogResponse = await c.env.ASSETS.fetch(
    new Request(new URL("/data/basketball/ncaa-player-box-catalog.json", c.req.url)),
  );
  if (!catalogResponse.ok) return c.text("NCAA source catalog is unavailable", 503);
  let receipt: { sha256?: unknown; season?: unknown } | undefined;
  try {
    const catalog = (await catalogResponse.json()) as {
      seasons?: Array<{ season?: unknown; sha256?: unknown }>;
    };
    receipt = catalog.seasons?.find((entry) => Number(entry.season) === season);
  } catch {
    return c.text("NCAA source catalog is invalid", 503);
  }
  const digest = typeof receipt?.sha256 === "string" ? receipt.sha256 : "";
  if (!receipt || !/^[a-f0-9]{64}$/.test(digest) || Number(receipt.season) !== season) {
    return c.text("NCAA source release not found", 404);
  }
  const headers = new Headers({
    "Content-Type": "application/vnd.apache.parquet",
    "Content-Disposition": `attachment; filename="ncaa_mbb_player_box_${season}.parquet"`,
    ETag: `"${digest}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, follow",
  });
  if (c.req.header("If-None-Match")?.split(",").map((tag) => tag.trim()).includes(`"${digest}"`)) {
    return new Response(null, { status: 304, headers });
  }
  const object = await c.env.RESEARCH_ARCHIVE.get(
    `basketball/ncaa-player-box/${season}/${digest}.parquet`,
  );
  if (!object || !("body" in object)) {
    return c.text("NCAA source release is temporarily unavailable", 503);
  }
  return new Response(object.body, { headers });
});

ncaaPlayerBox.get("/", zValidator("query", querySchema), async (c) => {
  const { season, q, page, meta } = c.req.valid("query");
  if (meta === "1") {
    const [seasons, count] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT season FROM bb_ncaa_player_box UNION SELECT season FROM bb_ncaa_player_season ORDER BY season DESC"),
      c.env.DB.prepare("SELECT (SELECT count(*) FROM bb_ncaa_player_box WHERE season=?) + (CASE WHEN (SELECT count(*) FROM bb_ncaa_player_box WHERE season=?)=0 THEN (SELECT count(*) FROM bb_ncaa_player_season WHERE season=?) ELSE 0 END) AS total").bind(season, season, season),
    ]);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
      total: Number((count.results[0] as { total: number }).total || 0),
    });
  }
  const rawCount = await c.env.DB.prepare("SELECT count(*) AS total FROM bb_ncaa_player_box WHERE season=?").bind(season).first<{ total: number }>();
  const archiveMode = Number(rawCount?.total || 0) > 0 ? "games" : "season";
  const table = archiveMode === "games" ? "bb_ncaa_player_box" : "bb_ncaa_player_season";
  const clauses = ["season=?"];
  const binds: Array<string | number> = [season];
  if (q) {
    clauses.push(archiveMode === "games"
      ? "(player_name LIKE ? OR team_name LIKE ? OR opponent_name LIKE ? OR player_id LIKE ? OR team_id LIKE ?)"
      : "(player_name LIKE ? OR team_name LIKE ? OR player_id LIKE ? OR team_id LIKE ?)");
    const search = `%${q}%`;
    binds.push(...(archiveMode === "games" ? [search, search, search, search, search] : [search, search, search, search]));
  }
  const where = clauses.join(" AND ");
  const count = await c.env.DB.prepare(`SELECT count(*) AS total FROM ${table} WHERE ${where}`).bind(...binds).first<{ total: number }>();
  const rows = await c.env.DB.prepare(
    archiveMode === "games"
      ? `SELECT season,contest_id,team_id,player_id,game_date,team_name,opponent_name,player_name,stats_json
         FROM bb_ncaa_player_box WHERE ${where}
         ORDER BY game_date DESC, player_name ASC, contest_id ASC LIMIT 50 OFFSET ?`
      : `SELECT season,NULL AS contest_id,team_id,player_id,NULL AS game_date,team_name,NULL AS opponent_name,player_name,stats_json
         FROM bb_ncaa_player_season WHERE ${where}
         ORDER BY player_name ASC, team_name ASC, player_id ASC LIMIT 50 OFFSET ?`,
  ).bind(...binds, page * 50).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    season, archive_mode: archiveMode,
    page,
    page_size: 50,
    total: Number(count?.total || 0),
    rows: rows.results.map(({ stats_json, ...row }) => ({ ...row, stats: JSON.parse(String(stats_json)) })),
  });
});
