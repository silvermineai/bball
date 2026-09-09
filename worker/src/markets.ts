import { researchDb } from "./research-db";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const querySchema = z.object({
  sport: z.enum(["football", "basketball"]).default("football"),
  season: z.coerce.number().int().min(2022).max(2035).default(2025),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  meta: z.enum(["0", "1"]).default("0"),
});

export const markets = new Hono<{ Bindings: Bindings }>();

const providerCapabilities = [
  {
    provider: "The Odds API",
    sports: ["football", "basketball"],
    markets: ["h2h", "spreads", "totals"],
    provider_update_clock: true,
    docs_url: "https://the-odds-api.com/liveapi/guides/v4/",
    policy: "Pregame provider-update and capture clocks are required before prospective comparison.",
  },
  {
    provider: "CollegeBasketballData.com API",
    sports: ["basketball"],
    markets: ["h2h"],
    provider_update_clock: false,
    docs_url: "https://api.collegebasketballdata.com/api/lines",
    policy: "The lines endpoint has a game start clock but no quote update clock; only captured pregame moneylines qualify.",
  },
];

markets.get("/", zValidator("query", querySchema), async (c) => {
  const { sport, season, q, page, meta } = c.req.valid("query");
  const football = sport === "football";
  // Both sports' append-only market observations live with the research
  // ledger. The legacy D1 remains reserved for the native football app and
  // its mutable scouting tables.
  const db = researchDb(c.env);
  if (meta === "1") {
    const seasonsSql = football
      ? "SELECT DISTINCT g.season FROM football_markets m JOIN football_games g ON g.id=m.game_id ORDER BY g.season DESC"
      : "SELECT DISTINCT g.season FROM audit_markets m JOIN bb_games g ON g.id=m.game_id WHERE m.sport=? ORDER BY g.season DESC";
    const archiveSql = football
      ? "SELECT count(*) AS total, sum(is_pregame) AS pregame FROM football_markets"
      : "SELECT count(*) AS total, count(*) AS pregame FROM audit_markets WHERE sport=?";
    const [seasons, archive] = football
      ? await db.batch([db.prepare(seasonsSql), db.prepare(archiveSql)])
      : await db.batch([db.prepare(seasonsSql).bind(sport), db.prepare(archiveSql).bind(sport)]);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      sport,
      seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
      total: Number((archive.results[0] as { total: number }).total || 0),
      pregame: Number((archive.results[0] as { pregame: number | null }).pregame || 0),
      provider_capabilities: providerCapabilities.filter((item) => item.sports.includes(sport)),
    });
  }
  const search = q ? `%${q}%` : null;
  const where = football
    ? search
      ? "g.season=? AND (g.home_name LIKE ? OR g.away_name LIKE ? OR m.source LIKE ?)"
      : "g.season=?"
    : search
      ? "g.season=? AND m.sport=? AND (g.home_name LIKE ? OR g.away_name LIKE ? OR m.provider LIKE ? OR m.bookmaker LIKE ?)"
      : "g.season=? AND m.sport=?";
  const binds: Array<string | number> = football
    ? search ? [season, search, search, search] : [season]
    : search ? [season, sport, search, search, search, search] : [season, sport];
  const marketTable = football ? "football_markets" : "audit_markets";
  const gameTable = football ? "football_games" : "bb_games";
  const count = await db.prepare(
    `SELECT count(*) AS total FROM ${marketTable} m JOIN ${gameTable} g ON g.id=m.game_id WHERE ${where}`,
  ).bind(...binds).first<{ total: number }>();
  const rows = await db.prepare(
    football
      ? `SELECT m.game_id,g.season,g.kickoff,g.home_name,g.away_name,
                m.home_spread,m.total,m.observed_at,m.source,m.is_pregame,
                NULL AS home_price,NULL AS away_price,NULL AS over_price,NULL AS under_price,
                NULL AS market,NULL AS bookmaker,NULL AS provider
           FROM football_markets m JOIN football_games g ON g.id=m.game_id
          WHERE ${where}
          ORDER BY g.kickoff DESC,m.observed_at DESC,m.game_id DESC LIMIT 40 OFFSET ?`
      : `SELECT m.game_id,g.season,g.starts_at AS kickoff,g.home_name,g.away_name,
                CASE WHEN m.market='spreads' THEN json_extract(m.payload_json,'$.line') END AS home_spread,
                CASE WHEN m.market='totals' THEN json_extract(m.payload_json,'$.line') END AS total,
                json_extract(m.payload_json,'$.home_price') AS home_price,
                json_extract(m.payload_json,'$.away_price') AS away_price,
                json_extract(m.payload_json,'$.over_price') AS over_price,
                json_extract(m.payload_json,'$.under_price') AS under_price,
                m.captured_at AS observed_at,m.provider AS source,1 AS is_pregame,
                m.market,m.bookmaker,m.provider
           FROM audit_markets m JOIN bb_games g ON g.id=m.game_id
          WHERE ${where}
          ORDER BY g.starts_at DESC,m.captured_at DESC,m.game_id DESC LIMIT 40 OFFSET ?`,
  ).bind(...binds, page * 40).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    sport,
    season,
    page,
    page_size: 40,
    total: count?.total ?? 0,
    rows: rows.results,
  });
});
