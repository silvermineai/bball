import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const querySchema = z.object({
  season: z.coerce.number().int().min(2022).max(2035).default(2025),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

export const markets = new Hono<{ Bindings: Bindings }>();

markets.get("/", zValidator("query", querySchema), async (c) => {
  const { season, q, page, meta } = c.req.valid("query");
  if (meta === "1") {
    const [seasons, archive] = await c.env.DB.batch([
      c.env.DB.prepare(
        "SELECT DISTINCT g.season FROM football_markets m JOIN football_games g ON g.id=m.game_id ORDER BY g.season DESC",
      ),
      c.env.DB.prepare("SELECT count(*) AS total, sum(is_pregame) AS pregame FROM football_markets"),
    ]);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
      total: Number((archive.results[0] as { total: number }).total || 0),
      pregame: Number((archive.results[0] as { pregame: number | null }).pregame || 0),
    });
  }
  const search = q ? `%${q}%` : null;
  const where = search
    ? "g.season=? AND (g.home_name LIKE ? OR g.away_name LIKE ? OR m.source LIKE ?)"
    : "g.season=?";
  const binds: Array<string | number> = search
    ? [season, search, search, search]
    : [season];
  const count = await c.env.DB.prepare(
    `SELECT count(*) AS total FROM football_markets m
       JOIN football_games g ON g.id=m.game_id
      WHERE ${where}`,
  ).bind(...binds).first<{ total: number }>();
  const rows = await c.env.DB.prepare(
    `SELECT m.game_id,g.season,g.kickoff,g.home_name,g.away_name,
            m.home_spread,m.total,m.observed_at,m.source,m.is_pregame
       FROM football_markets m
       JOIN football_games g ON g.id=m.game_id
      WHERE ${where}
      ORDER BY g.kickoff DESC,m.observed_at DESC,m.game_id DESC
      LIMIT 40 OFFSET ?`,
  ).bind(...binds, page * 40).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    season,
    page,
    page_size: 40,
    total: count?.total ?? 0,
    rows: rows.results,
  });
});
