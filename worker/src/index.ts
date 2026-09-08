import { Context, Hono } from "hono";
import { cors } from "hono/cors";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { shooting } from "./shooting";
import { recruiting } from "./recruiting";
import { careers } from "./careers";
import { footballEvents } from "./football-events";
import { briefArchive, retiredBrief } from "./brief-archive";
import { publisherStats } from "./publisher-stats";
import { markets } from "./markets";
import { teamStats } from "./team-stats";
import { boutique } from "./boutique";
import { lineups } from "./lineups";
import { playerCore } from "./player-core";
import { ncaaPlayerBox } from "./ncaa-player-box";
import { ncaaPlayerRankings } from "./ncaa-player-rankings";
import { ncaaRosters } from "./ncaa-rosters";

type Bindings = Env;

type AppEnv = {
  Bindings: Bindings;
  Variables: {
    user?: AuthUser;
  };
};

const app = new Hono<AppEnv>();
app.route("/", briefArchive);

const SESSION_COOKIE = "silvermine_session";
const SESSION_DAYS = 14;
const ADMIN_EMAIL = "bryan@silvermineai.com";
const SPORT_ID_TO_CODE: Record<string, string> = {
  s_mbb: "MBB",
  s_wbb: "WBB",
  s_bsb: "MBA",
  s_sfb: "WSB",
  s_fbl: "MFB",
  s_mso: "MSO",
  s_wso: "WSO",
};
const SPORT_CODE_TO_ID = Object.fromEntries(Object.entries(SPORT_ID_TO_CODE).map(([id, code]) => [code, id]));

app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173"],
    allowHeaders: ["Content-Type"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/api/health" || path.startsWith("/api/auth/")) {
    return next();
  }

  const user = await currentUser(c.env.DB, getCookie(c, SESSION_COOKIE));
  if (user) c.set("user", user);
  return next();
});

const listQuery = z.object({
  season: z.string().default("2025-26"),
  sport: z.string().default("s_mbb"),
  q: z.string().optional(),
  teamId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const playerFilterQuery = z.object({
  teamId: z.string().optional(),
  lastN: z.coerce.number().int().positive().max(50).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const authBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
});

const scrapeJobBody = z.object({
  mode: z.enum(["backfill", "seed-team", "scrape-pending", "scrape-game", "sample-sports"]),
  season: z.string().default("2025-26"),
  sport: z.string().default("s_mbb"),
  division: z.enum(["1", "2", "3"]).default("1"),
  teamId: z.coerce.number().int().positive().optional(),
  contestId: z.coerce.number().int().positive().optional(),
  maxTeams: z.coerce.number().int().positive().max(500).optional(),
  limit: z.coerce.number().int().positive().max(10000).optional(),
});
const ingestKeyBody = z.object({
  name: z.string().min(1).max(120).default("local backfill"),
});
const ingestBatchBody = z.object({
  table: z.enum([
    "seasons",
    "teams",
    "games",
    "team_games",
    "players",
    "player_game_stats",
    "play_by_play_actions",
    "shots",
    "scrape_logs",
  ]),
  rows: z.array(z.record(z.string(), z.unknown())).max(500),
});

app.get("/api/health", (c) => c.json({ ok: true, service: "bball-api" }));
app.route("/api/basketball/research/shooting", shooting);
app.route("/api/basketball/research/recruiting", recruiting);
app.route("/api/basketball/research/careers", careers);
app.route("/api/basketball/research/publisher-stats", publisherStats);
app.route("/api/basketball/research/team-stats", teamStats);
app.route("/api/basketball/research/boutique", boutique);
app.route("/api/basketball/research/lineups", lineups);
app.route("/api/basketball/research/player-core", playerCore);
app.route("/api/basketball/research/ncaa-player-box", ncaaPlayerBox);
app.route("/api/basketball/research/ncaa-player-rankings", ncaaPlayerRankings);
app.route("/api/basketball/research/ncaa-rosters", ncaaRosters);
app.route("/api/research/markets", markets);
app.get("/api/football/events/", (c) => {
  const url = new URL(c.req.url);
  return c.redirect(`/api/football/events${url.search}`, 308);
});
app.route("/api/football/events", footballEvents);

const footballPlayerQuery = z.object({
  season: z.coerce.number().int().min(2022).max(2035).default(2025),
  page: z.coerce.number().int().min(0).max(200).default(0),
});

app.get("/api/football/players/:id", zValidator("query", footballPlayerQuery), async (c) => {
  const id = c.req.param("id");
  if (!/^\d{1,15}$/.test(id)) return c.json({ error: "Invalid player ID" }, 400);
  const { season, page } = c.req.valid("query");
  const [count, result] = await Promise.all([
    c.env.DB.prepare("SELECT count(*) AS total FROM football_stats WHERE athlete_id=? AND season=?").bind(id, season).first<{ total: number }>(),
    c.env.DB.prepare(`SELECT s.dataset,s.game_id,s.category,s.stats_json,g.kickoff,g.home_name,g.away_name
      FROM football_stats s LEFT JOIN football_games g ON g.id=s.game_id
      WHERE s.athlete_id=? AND s.season=? ORDER BY g.kickoff DESC,s.dataset,s.record_key LIMIT 50 OFFSET ?`)
      .bind(id, season, page * 50).all<{ dataset: string; game_id: string | null; category: string; stats_json: string; kickoff: string | null; home_name: string | null; away_name: string | null }>(),
  ]);
  if (!count?.total) return c.json({ error: "No records found" }, 404);
  const rows = result.results.map(({ stats_json, ...row }) => ({ ...row, stats: JSON.parse(stats_json) as Record<string, string> }));
  const first = rows[0]?.stats;
  const name = first?.athlete_name ?? first?.passer_player_name ?? first?.rusher_player_name ?? first?.receiver_player_name ?? id;
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ rows, total: count.total, name, season, page });
});

app.get("/api/football/coverage", async (c) => {
  const result = await c.env.DB.prepare(`SELECT 'games' AS dataset,count(*) AS rows FROM football_games
    UNION ALL SELECT dataset,count(*) FROM football_stats GROUP BY dataset`).all();
  return c.json({ coverage: result.results });
});

const researchHistoryQuery = z.object({
  kind: z.enum(["predictions", "states"]).default("predictions"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
});
app.get(
  "/api/research/games/:sport/:id",
  zValidator("query", researchHistoryQuery),
  async (c) => {
    const { sport, id } = c.req.param();
    if (!["football", "basketball"].includes(sport) || !/^\d{1,15}$/.test(id)) {
      return c.json({ error: "Invalid sport or game ID" }, 400);
    }
    const { kind, page } = c.req.valid("query");
    const table =
      kind === "predictions" ? "audit_predictions" : "audit_game_states";
    const clock = kind === "predictions" ? "registered_at" : "observed_at";
    const [count, rows] = await Promise.all([
      c.env.DB.prepare(
        `SELECT count(*) AS total FROM ${table} WHERE sport=? AND game_id=?`,
      )
        .bind(sport, id)
        .first<{ total: number }>(),
      c.env.DB.prepare(
        `SELECT * FROM ${table} WHERE sport=? AND game_id=? ORDER BY ${clock} DESC,id DESC LIMIT 25 OFFSET ?`,
      )
        .bind(sport, id, page * 25)
        .all<{ payload_json: string; id: string }>(),
    ]);
    if (!count?.total)
      return c.json({ error: "No registered history for this game" }, 404);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      sport,
      game_id: id,
      kind,
      page,
      total: count.total,
      rows: rows.results.map(({ payload_json, ...row }) => ({
        ...row,
        payload: JSON.parse(payload_json),
      })),
    });
  },
);

const basketballPlayerQuery = z.object({
  season: z.coerce.number().int().min(2024).max(2035).default(2026),
  page: z.coerce.number().int().min(0).max(100).default(0),
});
app.get(
  "/api/basketball/research/players/:id",
  zValidator("query", basketballPlayerQuery),
  async (c) => {
    const id = c.req.param("id");
    if (!/^\d{1,15}$/.test(id))
      return c.json({ error: "Invalid player ID" }, 400);
    const { season, page } = c.req.valid("query");
    const player = await c.env.DB.prepare("SELECT * FROM bb_players WHERE id=?")
      .bind(id)
      .first();
    if (!player) return c.json({ error: "Player not found" }, 404);
    const [count, box, rosters, totals, participation] = await Promise.all([
      c.env.DB.prepare(
        "SELECT count(*) AS total FROM bb_player_box WHERE athlete_id=? AND season=?",
      )
        .bind(id, season)
        .first<{ total: number }>(),
      c.env.DB.prepare(
        `SELECT p.team_id,p.game_id,p.stats_json,g.starts_at,g.home_name,g.away_name FROM bb_player_box p
      LEFT JOIN bb_games g ON g.id=p.game_id WHERE p.athlete_id=? AND p.season=? ORDER BY g.starts_at DESC,p.game_id LIMIT 40 OFFSET ?`,
      )
        .bind(id, season, page * 40)
        .all<{
          team_id: string;
          game_id: string;
          stats_json: string;
          starts_at: string | null;
          home_name: string | null;
          away_name: string | null;
        }>(),
      c.env.DB.prepare(
        "SELECT season,team_id,profile_json FROM bb_rosters WHERE athlete_id=? ORDER BY season DESC,team_id",
      )
        .bind(id)
        .all<{ season: number; team_id: string; profile_json: string }>(),
      c.env.DB.prepare(
        "SELECT team_id,stats_json FROM bb_player_season WHERE athlete_id=? AND season=?",
      )
        .bind(id, season)
        .all<{ team_id: string; stats_json: string }>(),
      c.env.DB.prepare(
        "SELECT season,team_id,games,minutes FROM bb_participation WHERE athlete_id=? ORDER BY season DESC,team_id",
      )
        .bind(id)
        .all(),
    ]);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      player,
      season,
      total: count?.total ?? 0,
      rows: box.results.map(({ stats_json, ...row }) => ({
        ...row,
        stats: JSON.parse(stats_json),
      })),
      rosters: rosters.results.map(({ profile_json, ...row }) => ({
        ...row,
        profile: JSON.parse(profile_json),
      })),
      seasonStats: totals.results.map(({ stats_json, ...row }) => ({
        ...row,
        stats: JSON.parse(stats_json),
      })),
      participation: participation.results,
    });
  },
);
app.get("/api/basketball/research/coverage", async (c) => {
  // D1 limits compound SELECT terms; count each dataset in one batch.
  const tables = {
    games: "bb_games",
    player_box: "bb_player_box",
    team_box: "bb_team_box",
    rosters: "bb_rosters",
    impact: "bb_impact",
    ncaa_individual_players: "ncaa_individual_players",
    forecasts: "bb_forecasts",
    player_core: "bb_player_core",
    unresolved: "bb_unresolved",
  };
  const counts = await c.env.DB.batch<{ rows: number }>(
    Object.values(tables).map((table) =>
      c.env.DB.prepare(`SELECT count(*) AS rows FROM ${table}`),
    ),
  );
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    coverage: Object.keys(tables).map((dataset, index) => ({
      dataset,
      rows: counts[index].results[0].rows,
    })),
  });
});

const ncaaLeaderQuery = z.object({
  division: z.enum(["1", "2", "3", "all"]).default("1"),
  stat: z.enum(["ppg", "rpg", "apg", "spg", "bpg", "fg_pct", "three_pct", "ft_pct", "threes_pg", "mpg", "ast_to", "dbl_dbl"]).default("ppg"),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(0).max(100).default(0),
});
app.get("/api/basketball/research/ncaa-leaders", zValidator("query", ncaaLeaderQuery), async (c) => {
  const { division, stat, q, page } = c.req.valid("query");
  const where = division === "all" ? "season=?" : "season=? AND division=?";
  const binds: Array<string | number> = division === "all" ? [2026] : [2026, Number(division)];
  const search = q?.trim();
  const searchSql = search ? " AND (name LIKE ? OR team_name LIKE ? OR payload_json LIKE ?)" : "";
  if (search) binds.push(`%${search}%`, `%${search}%`, `%${search}%`);
  const columnStat = new Set(["ppg", "rpg", "apg", "mpg"]).has(stat);
  const value = columnStat ? stat : `json_extract(payload_json, '$.${stat}')`;
  const order = `${value} IS NULL, ${value} DESC, name, player_id`;
  const rows = await c.env.DB.prepare(`SELECT player_id,division,name,team_name,${value} AS stat_value,ppg_rank,payload_json FROM ncaa_individual_players WHERE ${where}${searchSql} ORDER BY ${order} LIMIT 40 OFFSET ?`).bind(...binds, page * 40).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ season: 2026, division, stat, page, rows: rows.results.map((row) => { const payload = JSON.parse(String(row.payload_json)); const { payload_json, stat_value, ...summary } = row as Record<string, unknown>; return { ...summary, [stat]: stat_value, payload }; }) });
});

// Keep completed-game reading snapshots reachable from their original URLs.
app.get("/blog/*", async (c) => {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  const match = new URL(c.req.url).pathname.match(/^\/blog\/game-(\d{1,15})\/?$/);
  return match ? retiredBrief(c.env,c.req.raw,"football",match[1],asset) : asset;
});

// Preserve basketball deep links while Next.js owns the new publication pages.
app.get("/basketball", (c) => c.redirect("/basketball/", 302));
app.get("/basketball/*", async (c) => {
  const url = new URL(c.req.url);
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (asset.status !== 404 || /\.[a-z0-9]+$/i.test(url.pathname)) return asset;
  const retired = url.pathname.match(/^\/basketball\/briefs\/(\d{1,15})\/?$/);
  if (retired) return retiredBrief(c.env,c.req.raw,"basketball",retired[1],asset);
  // Only old, known archive routes receive the SPA fallback. New publication
  // paths and unknown routes should retain a genuine 404.
  if (
    !/^\/basketball\/(scout|gameplan|pressroom|rankings|season|leaders|conferences|teams|games|players|login|admin)(\/|$)/.test(
      url.pathname,
    )
  )
    return asset;
  url.pathname = "/basketball-shell/";
  return c.env.ASSETS.fetch(new Request(url, { headers: c.req.raw.headers }));
});

for (const path of ["scout", "gameplan", "recruiting", "pressroom", "film", "rankings", "season", "leaders", "conferences", "teams", "games", "players", "login", "admin"]) {
  const redirectLegacy = (c: Context<AppEnv>) => { const u = new URL(c.req.url); return c.redirect(`/basketball${u.pathname}${u.search}`, 302); };
  app.get(`/${path}`, redirectLegacy);
  app.get(`/${path}/`, redirectLegacy);
  app.get(`/${path}/*`, redirectLegacy);
}

app.get("/api/auth/me", async (c) => {
  const user = await currentUser(c.env.DB, getCookie(c, SESSION_COOKIE));
  return c.json({ user: user ? publicUser(user) : null });
});

app.post("/api/auth/register", zValidator("json", authBody), async (c) => {
  const { email, password } = c.req.valid("json");
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await first(c.env.DB, "SELECT id FROM users WHERE email = ?", normalizedEmail);
  if (existing) return c.json({ error: "An account already exists for that email" }, 409);

  const passwordHash = await hashPassword(password);
  const created = await c.env.DB
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id, email, created_at AS createdAt")
    .bind(normalizedEmail, passwordHash)
    .first<AuthUser>();
  if (!created) return c.json({ error: "Could not create account" }, 500);

  await createSession(c, created.id);
  return c.json({ user: publicUser(created) }, 201);
});

app.post("/api/auth/login", zValidator("json", authBody), async (c) => {
  const { email, password } = c.req.valid("json");
  const user = await first<AuthUser & { password_hash: string }>(
    c.env.DB,
    "SELECT id, email, password_hash, created_at AS createdAt FROM users WHERE email = ?",
    email.trim().toLowerCase(),
  );

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  await createSession(c, user.id);
  return c.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/api/teams", zValidator("query", listQuery), async (c) => {
  const { season, sport, q } = c.req.valid("query");
  const like = `%${q ?? ""}%`;
  const rows = await all(c.env.DB, TEAM_LIST_SQL, season, sourceSportCode(sport), like);
  return c.json({ teams: rows });
});

app.get("/api/teams/:teamId", async (c) => {
  const teamId = c.req.param("teamId");
  const team = await first<{ sourceTeamId: number; orgId?: number; id: string } & Record<string, unknown>>(c.env.DB, TEAM_DETAIL_SQL, teamId);
  if (!team) return c.json({ error: "Team not found" }, 404);
  const sourceTeamId = team.sourceTeamId;

  const games = await all(c.env.DB, TEAM_GAMES_SQL, sourceTeamId);
  const players = await all(c.env.DB, TEAM_PLAYERS_SQL, sourceTeamId);
  const shots = await all(c.env.DB, TEAM_SHOTS_SQL, sourceTeamId);
  const user = c.get("user");
  const isFavorite = user ? await favoriteExists(c.env.DB, user.id, "team", sourceTeamId) : false;
  const { sourceTeamId: _, ...publicTeam } = team;
  return c.json({ team: { ...publicTeam, isFavorite }, games, players, shots });
});

app.get("/api/games", zValidator("query", listQuery), async (c) => {
  const { season, sport, teamId, from, to } = c.req.valid("query");
  const sourceTeamId = teamId ? await resolveTeamSourceId(c.env.DB, String(teamId)) : null;
  const rows = await all(
    c.env.DB,
    GAME_LIST_SQL,
    season,
    sourceSportCode(sport),
    sourceSportCode(sport),
    sourceTeamId,
    sourceTeamId,
    sourceTeamId,
    from ?? null,
    from ?? null,
    to ?? null,
    to ?? null,
  );
  return c.json({ games: rows });
});

app.get("/api/games/:contestId", async (c) => {
  const contestId = c.req.param("contestId");
  const game = await first<{ sourceContestId: number } & Record<string, unknown>>(c.env.DB, GAME_DETAIL_SQL, contestId);
  if (!game) return c.json({ error: "Game not found" }, 404);
  const sourceContestId = game.sourceContestId;
  const playerStats = await all(c.env.DB, GAME_PLAYER_STATS_SQL, sourceContestId);
  const shots = await all(c.env.DB, GAME_SHOTS_SQL, sourceContestId);
  const actions = await all(c.env.DB, GAME_ACTIONS_SQL, sourceContestId);
  const { sourceContestId: _, ...publicGame } = game;
  return c.json({ game: publicGame, playerStats, shots, actions });
});

app.get("/api/players", zValidator("query", z.object({ sport: z.string().default("s_mbb"), teamId: z.string().optional(), q: z.string().optional() })), async (c) => {
  const { sport, teamId, q } = c.req.valid("query");
  const sourceTeamId = teamId ? await resolveTeamSourceId(c.env.DB, teamId) : null;
  const rows = await all(c.env.DB, PLAYER_LIST_SQL, sourceTeamId, sourceTeamId, sourceSportCode(sport), sourceSportCode(sport), `%${q ?? ""}%`);
  return c.json({ players: rows });
});

app.get("/api/players/:playerId", zValidator("query", playerFilterQuery), async (c) => {
  const playerId = c.req.param("playerId");
  const sourcePlayerId = await resolvePlayerSourceId(c.env.DB, playerId);
  if (!sourcePlayerId) return c.json({ error: "Player not found" }, 404);
  const filters = c.req.valid("query");
  const gameIds = await playerGameIds(c.env.DB, sourcePlayerId, filters);
  const player = await first(c.env.DB, PLAYER_DETAIL_SQL, sourcePlayerId);
  if (!player) return c.json({ error: "Player not found" }, 404);
  const user = c.get("user");
  const isFavorite = user ? await favoriteExists(c.env.DB, user.id, "player", sourcePlayerId) : false;
  const playerWithFavorite = { ...player, isFavorite };
  if (!gameIds.length) return c.json({ player: playerWithFavorite, summary: null, gameLog: [], shots: [] });
  const placeholders = gameIds.map(() => "?").join(",");
  const summary = await first(c.env.DB, PLAYER_SUMMARY_SQL.replace("/*GAME_IDS*/", placeholders), sourcePlayerId, ...gameIds);
  const gameLog = await all(c.env.DB, PLAYER_GAME_LOG_SQL.replace("/*GAME_IDS*/", placeholders), sourcePlayerId, ...gameIds);
  const shots = await all(c.env.DB, PLAYER_SHOTS_SQL.replace("/*GAME_IDS*/", placeholders), sourcePlayerId, ...gameIds);
  return c.json({ player: playerWithFavorite, summary, gameLog, shots });
});

app.get("/api/players/:playerId/shots", zValidator("query", playerFilterQuery), async (c) => {
  const playerId = c.req.param("playerId");
  const sourcePlayerId = await resolvePlayerSourceId(c.env.DB, playerId);
  if (!sourcePlayerId) return c.json({ shots: [] });
  const gameIds = await playerGameIds(c.env.DB, sourcePlayerId, c.req.valid("query"));
  if (!gameIds.length) return c.json({ shots: [] });
  const placeholders = gameIds.map(() => "?").join(",");
  const shots = await all(c.env.DB, PLAYER_SHOTS_SQL.replace("/*GAME_IDS*/", placeholders), sourcePlayerId, ...gameIds);
  return c.json({ shots });
});

app.get("/api/search", zValidator("query", z.object({ q: z.string().default("") })), async (c) => {
  const like = `%${c.req.valid("query").q}%`;
  const teams = await all(c.env.DB, "SELECT internal_id AS id, name, 'team' AS type FROM teams WHERE name LIKE ? LIMIT 8", like);
  const players = await all(c.env.DB, "SELECT internal_id AS id, name, 'player' AS type FROM players WHERE name LIKE ? LIMIT 8", like);
  return c.json({ results: [...teams, ...players] });
});

app.get("/api/favorites", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const userId = user.id;
  const teams = await all(c.env.DB, FAVORITE_TEAMS_SQL, userId);
  const players = await all(c.env.DB, FAVORITE_PLAYERS_SQL, userId);
  return c.json({ teams, players });
});

app.post("/api/favorites/:type/:id", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const type = favoriteType(c.req.param("type"));
  const id = type ? await resolveFavoriteSourceId(c.env.DB, type, c.req.param("id")) : null;
  if (!type || !id) return c.json({ error: "Invalid favorite" }, 400);
  await c.env.DB.prepare("INSERT OR IGNORE INTO user_favorites (user_id, favorite_type, entity_id) VALUES (?, ?, ?)")
    .bind(user.id, type, id)
    .run();
  return c.json({ ok: true, type, id, isFavorite: true });
});

app.delete("/api/favorites/:type/:id", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const type = favoriteType(c.req.param("type"));
  const id = type ? await resolveFavoriteSourceId(c.env.DB, type, c.req.param("id")) : null;
  if (!type || !id) return c.json({ error: "Invalid favorite" }, 400);
  await c.env.DB.prepare("DELETE FROM user_favorites WHERE user_id = ? AND favorite_type = ? AND entity_id = ?")
    .bind(user.id, type, id)
    .run();
  return c.json({ ok: true, type, id, isFavorite: false });
});

app.get(
  "/api/admin/scrape-logs",
  zValidator(
    "query",
    z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(25),
    }),
  ),
  async (c) => {
    const user = c.get("user");
    if (!user || !isAdmin(user)) return c.json({ error: "Admin access required" }, 403);
    const { page, pageSize } = c.req.valid("query");
    const offset = (page - 1) * pageSize;
    const rows = await all(c.env.DB, ADMIN_SCRAPE_LOGS_SQL, pageSize, offset);
    const total = await first<{ total: number }>(c.env.DB, "SELECT COUNT(*) AS total FROM scrape_logs");
    return c.json({ rows, page, pageSize, total: total?.total ?? 0 });
  },
);

app.get(
  "/api/admin/games",
  zValidator(
    "query",
    z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(25),
      status: z.string().optional(),
      division: z.enum(["1", "2", "3"]).optional(),
      sport: z.string().optional(),
    }),
  ),
  async (c) => {
  const user = c.get("user");
  if (!user || !isAdmin(user)) return c.json({ error: "Admin access required" }, 403);
  const { page, pageSize, status, division, sport } = c.req.valid("query");
  const offset = (page - 1) * pageSize;
  const sportCode = sport ? sourceSportCode(sport) : null;
  const params = [status ?? null, status ?? null, division ?? null, division ?? null, sportCode, sportCode, pageSize, offset];
    const rows = await all(c.env.DB, ADMIN_GAMES_SQL, ...params);
    const total = await first<{ total: number }>(
      c.env.DB,
      ADMIN_GAMES_COUNT_SQL,
      status ?? null,
      status ?? null,
      division ?? null,
      division ?? null,
      sportCode,
      sportCode,
    );
    return c.json({ rows, page, pageSize, total: total?.total ?? 0 });
  },
);

app.get("/api/admin/summary", async (c) => {
  const user = c.get("user");
  if (!user || !isAdmin(user)) return c.json({ error: "Admin access required" }, 403);
  const divisions = await all(c.env.DB, ADMIN_DIVISION_SUMMARY_SQL);
  const statuses = await all(c.env.DB, "SELECT scrape_status AS status, COUNT(*) AS games FROM games GROUP BY scrape_status ORDER BY games DESC");
  const logs = await first<{ logs: number }>(c.env.DB, "SELECT COUNT(*) AS logs FROM scrape_logs");
  const jobs = await first<{ jobs: number }>(c.env.DB, "SELECT COUNT(*) AS jobs FROM scrape_jobs");
  return c.json({ divisions, statuses, logs: logs?.logs ?? 0, jobs: jobs?.jobs ?? 0 });
});

app.get(
  "/api/admin/scrape-jobs",
  zValidator(
    "query",
    z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(25),
      status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]).optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user");
    if (!user || !isAdmin(user)) return c.json({ error: "Admin access required" }, 403);
    const { page, pageSize, status } = c.req.valid("query");
    const offset = (page - 1) * pageSize;
    const rows = await all(c.env.DB, ADMIN_SCRAPE_JOBS_SQL, status ?? null, status ?? null, pageSize, offset);
    const total = await first<{ total: number }>(
      c.env.DB,
      "SELECT COUNT(*) AS total FROM scrape_jobs WHERE (? IS NULL OR status = ?)",
      status ?? null,
      status ?? null,
    );
    return c.json({ rows, page, pageSize, total: total?.total ?? 0 });
  },
);

app.post("/api/admin/scrape-jobs", zValidator("json", scrapeJobBody), async (c) => {
  const user = c.get("user");
  if (!user || !isAdmin(user)) return c.json({ error: "Admin access required" }, 403);
  const body = c.req.valid("json");
  const sportCode = sourceSportCode(body.sport);
  const created = await c.env.DB
    .prepare(
      `INSERT INTO scrape_jobs
       (requested_by_user_id, mode, season_label, division, seed_team_id, contest_id, max_teams, game_limit, status, runner_type, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'scrapling-python', ?)
       RETURNING id, mode, season_label AS season, division, seed_team_id AS seedTeamId, contest_id AS contestId,
                 max_teams AS maxTeams, game_limit AS gameLimit, status, runner_type AS runnerType, message,
                 created_at AS createdAt, started_at AS startedAt, finished_at AS finishedAt, updated_at AS updatedAt`,
    )
    .bind(
      user.id,
      body.mode,
      body.season,
      body.division,
      body.teamId ?? null,
      body.contestId ?? null,
      body.maxTeams ?? null,
      body.limit ?? null,
      `Queued for ${sportCode}. Scrapling requires a Python executor; Cloudflare Workers cannot run the Scrapling runtime directly.`,
    )
    .first();
  return c.json({ job: created }, 201);
});

app.get("/api/admin/ingest-keys", async (c) => {
  const user = c.get("user");
  if (!user || !isAdmin(user)) return c.json({ error: "Admin access required" }, 403);
  const rows = await all(
    c.env.DB,
    `SELECT id, name, token_prefix AS tokenPrefix, created_at AS createdAt,
            last_used_at AS lastUsedAt, revoked_at AS revokedAt
     FROM ingest_api_keys
     ORDER BY datetime(created_at) DESC, id DESC`,
  );
  return c.json({ keys: rows });
});

app.post("/api/admin/ingest-keys", zValidator("json", ingestKeyBody), async (c) => {
  const user = c.get("user");
  if (!user || !isAdmin(user)) return c.json({ error: "Admin access required" }, 403);
  const token = `bball_${randomHex(32)}`;
  const tokenHash = await sha256Hex(token);
  const tokenPrefix = token.slice(0, 14);
  const key = await c.env.DB
    .prepare(
      `INSERT INTO ingest_api_keys (name, token_prefix, token_hash, created_by_user_id)
       VALUES (?, ?, ?, ?)
       RETURNING id, name, token_prefix AS tokenPrefix, created_at AS createdAt`,
    )
    .bind(c.req.valid("json").name, tokenPrefix, tokenHash, user.id)
    .first();
  return c.json({ key, token }, 201);
});

app.delete("/api/admin/ingest-keys/:id", async (c) => {
  const user = c.get("user");
  if (!user || !isAdmin(user)) return c.json({ error: "Admin access required" }, 403);
  await c.env.DB.prepare("UPDATE ingest_api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(Number(c.req.param("id")))
    .run();
  return c.json({ ok: true });
});

app.post("/api/ingest/batch", zValidator("json", ingestBatchBody), async (c) => {
  const key = await requireIngestKey(c);
  if (key instanceof Response) return key;
  const { table, rows } = c.req.valid("json");
  const tableDef = INGEST_TABLES[table];
  if (!rows.length) return c.json({ ok: true, table, rows: 0 });

  const statements = rows.map((row) => {
    const values = tableDef.columns.map((column) => normalizeIngestValue(row[column]));
    const sql = `INSERT OR REPLACE INTO ${table} (${tableDef.columns.join(", ")}) VALUES (${tableDef.columns
      .map(() => "?")
      .join(", ")})`;
    return c.env.DB.prepare(sql).bind(...values);
  });
  await c.env.DB.batch(statements);
  await c.env.DB.prepare("UPDATE ingest_api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(key.id).run();
  return c.json({ ok: true, table, rows: rows.length });
});

async function playerGameIds(db: D1Database, playerId: number, filters: z.infer<typeof playerFilterQuery>) {
  const where = ["pgs.ncaa_player_id = ?"];
  const params: unknown[] = [playerId];
  if (filters.teamId) {
    const sourceTeamId = await resolveTeamSourceId(db, filters.teamId);
    where.push("pgs.team_org_id = (SELECT org_id FROM teams WHERE ncaa_team_id = ?)");
    params.push(sourceTeamId);
  }
  if (!filters.lastN) {
    if (filters.from) {
      where.push("date(g.game_date) >= date(?)");
      params.push(filters.from);
    }
    if (filters.to) {
      where.push("date(g.game_date) <= date(?)");
      params.push(filters.to);
    }
  }
  const limit = filters.lastN ? `LIMIT ${filters.lastN}` : "";
  const rows = await all<{ contest_id: number }>(
    db,
    `SELECT pgs.contest_id
     FROM player_game_stats pgs
     JOIN games g ON g.contest_id = pgs.contest_id
     WHERE ${where.join(" AND ")}
     ORDER BY g.game_date DESC ${limit}`,
    ...params,
  );
  return rows.map((row) => row.contest_id);
}

function sourceSportCode(value: string | null | undefined) {
  if (!value) return "MBB";
  return SPORT_ID_TO_CODE[value.toLowerCase()] ?? value.toUpperCase();
}

function publicSportId(value: string | null | undefined) {
  if (!value) return "s_mbb";
  return SPORT_CODE_TO_ID[value.toUpperCase()] ?? `s_${value.toLowerCase().slice(0, 3).padEnd(3, "x")}`;
}

async function resolveTeamSourceId(db: D1Database, id: string) {
  if (/^\d+$/.test(id)) return Number(id);
  const row = await first<{ ncaa_team_id: number }>(db, "SELECT ncaa_team_id FROM teams WHERE internal_id = ?", id);
  return row?.ncaa_team_id ?? null;
}

async function resolvePlayerSourceId(db: D1Database, id: string) {
  if (/^\d+$/.test(id)) return Number(id);
  const row = await first<{ ncaa_player_id: number }>(db, "SELECT ncaa_player_id FROM players WHERE internal_id = ? AND ncaa_player_id IS NOT NULL", id);
  return row?.ncaa_player_id ?? null;
}

async function resolveFavoriteSourceId(db: D1Database, type: FavoriteType, id: string) {
  return type === "team" ? resolveTeamSourceId(db, id) : resolvePlayerSourceId(db, id);
}

async function all<T = Record<string, unknown>>(db: D1Database, sql: string, ...params: unknown[]) {
  const { results } = await db.prepare(sql).bind(...params).all<T>();
  return results ?? [];
}

async function first<T = Record<string, unknown>>(db: D1Database, sql: string, ...params: unknown[]) {
  return db.prepare(sql).bind(...params).first<T>();
}

type FavoriteType = "team" | "player";

function favoriteType(value: string): FavoriteType | null {
  return value === "team" || value === "player" ? value : null;
}

function requireUser(c: Context<AppEnv>): AuthUser | Response {
  const user = c.get("user");
  return user ?? c.json({ error: "Login required" }, 401);
}

type IngestKey = {
  id: number;
};

async function requireIngestKey(c: Context<AppEnv>): Promise<IngestKey | Response> {
  const auth = c.req.header("authorization") ?? "";
  const headerToken = c.req.header("x-bball-ingest-key");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : headerToken;
  if (!token) return c.json({ error: "Ingest API key required" }, 401);
  const tokenHash = await sha256Hex(token);
  const key = await first<IngestKey>(
    c.env.DB,
    "SELECT id FROM ingest_api_keys WHERE token_hash = ? AND revoked_at IS NULL",
    tokenHash,
  );
  return key ?? c.json({ error: "Invalid ingest API key" }, 401);
}

function normalizeIngestValue(value: unknown): unknown {
  if (typeof value === "boolean") return value ? 1 : 0;
  return value ?? null;
}

async function favoriteExists(db: D1Database, userId: number, type: FavoriteType, id: number) {
  const row = await first<{ found: number }>(
    db,
    "SELECT 1 AS found FROM user_favorites WHERE user_id = ? AND favorite_type = ? AND entity_id = ?",
    userId,
    type,
    id,
  );
  return Boolean(row);
}

type AuthUser = {
  id: number;
  email: string;
  createdAt?: string;
};

function isAdmin(user: AuthUser) {
  return user.email.toLowerCase() === ADMIN_EMAIL;
}

function publicUser(user: AuthUser) {
  return { ...user, isAdmin: isAdmin(user) };
}

async function currentUser(db: D1Database, token?: string): Promise<AuthUser | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const user = await first<AuthUser>(
    db,
    `SELECT u.id, u.email, u.created_at AS createdAt
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND datetime(s.expires_at) > datetime('now')`,
    tokenHash,
  );
  if (!user) return null;
  return user;
}

async function createSession(c: Context<AppEnv>, userId: number) {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await c.env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(tokenHash, userId, expiresAt)
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

async function hashPassword(password: string) {
  const iterations = 100_000;
  const salt = randomHex(16);
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, iterationsText, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2_sha256" || !iterationsText || !salt || !hash) return false;
  const candidate = await pbkdf2(password, salt, Number(iterationsText));
  return timingSafeEqual(candidate, hash);
}

async function pbkdf2(password: string, saltHex: string, iterations: number) {
  const passwordKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: hexToBytes(saltHex),
      iterations,
    },
    passwordKey,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function timingSafeEqual(a: string, b: string) {
  const aBytes = hexToBytes(a);
  const bBytes = hexToBytes(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function randomHex(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  if (hex.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

const TEAM_LIST_SQL = `
SELECT
  t.internal_id AS id,
  t.sport_code AS sportCode,
  CASE t.sport_code
    WHEN 'MBB' THEN 's_mbb'
    WHEN 'WBB' THEN 's_wbb'
    WHEN 'MBA' THEN 's_bsb'
    WHEN 'WSB' THEN 's_sfb'
    WHEN 'MFB' THEN 's_fbl'
    WHEN 'MSO' THEN 's_mso'
    WHEN 'WSO' THEN 's_wso'
    ELSE 's_' || lower(substr(t.sport_code, 1, 3))
  END AS sportId,
  t.name,
  t.record,
  COUNT(DISTINCT tg.contest_id) AS games,
  ROUND(AVG(CASE WHEN g.home_team_id = t.ncaa_team_id THEN g.home_score ELSE g.away_score END), 1) AS pointsFor,
  ROUND(AVG(CASE WHEN g.home_team_id = t.ncaa_team_id THEN g.away_score ELSE g.home_score END), 1) AS pointsAgainst
FROM teams t
LEFT JOIN team_games tg ON tg.ncaa_team_id = t.ncaa_team_id
LEFT JOIN games g ON g.contest_id = tg.contest_id
WHERE t.season_label = ? AND t.sport_code = ? AND t.name LIKE ?
GROUP BY t.ncaa_team_id
ORDER BY t.name`;

const TEAM_DETAIL_SQL = `
SELECT internal_id AS id, ncaa_team_id AS sourceTeamId, name, record, season_label AS season,
       CASE sport_code
         WHEN 'MBB' THEN 's_mbb'
         WHEN 'WBB' THEN 's_wbb'
         WHEN 'MBA' THEN 's_bsb'
         WHEN 'WSB' THEN 's_sfb'
         WHEN 'MFB' THEN 's_fbl'
         WHEN 'MSO' THEN 's_mso'
         WHEN 'WSO' THEN 's_wso'
         ELSE 's_' || lower(substr(sport_code, 1, 3))
       END AS sportId
FROM teams
WHERE internal_id = ?`;

const TEAM_GAMES_SQL = `
SELECT g.internal_id AS id, g.game_date AS date, g.venue, g.away_score AS awayScore, g.home_score AS homeScore,
       away.name AS awayTeam, home.name AS homeTeam, tg.result
FROM team_games tg
JOIN games g ON g.contest_id = tg.contest_id
LEFT JOIN teams away ON away.ncaa_team_id = g.away_team_id
LEFT JOIN teams home ON home.ncaa_team_id = g.home_team_id
WHERE tg.ncaa_team_id = ?
ORDER BY g.game_date DESC`;

const TEAM_PLAYERS_SQL = `
SELECT p.internal_id AS id, MAX(pgs.player_name) AS name, MAX(pgs.position) AS position,
       COUNT(*) AS games, ROUND(AVG(pgs.points), 1) AS ppg, ROUND(AVG(pgs.total_rebounds), 1) AS rpg,
       ROUND(AVG(pgs.assists), 1) AS apg, SUM(pgs.fga) AS fga, SUM(pgs.three_fga) AS threeFga
FROM player_game_stats pgs
JOIN (SELECT ncaa_player_id, MAX(internal_id) AS internal_id FROM players GROUP BY ncaa_player_id) p ON p.ncaa_player_id = pgs.ncaa_player_id
WHERE pgs.team_org_id = (SELECT org_id FROM teams WHERE ncaa_team_id = ?)
GROUP BY pgs.ncaa_player_id
ORDER BY ppg DESC`;

const TEAM_SHOTS_SQL = `
SELECT s.play_id AS id, s.x, s.y, s.made, s.is_three AS isThree, s.player_name AS playerName, p.internal_id AS playerId
FROM shots s
LEFT JOIN (SELECT ncaa_player_id, MAX(internal_id) AS internal_id FROM players GROUP BY ncaa_player_id) p ON p.ncaa_player_id = s.ncaa_player_id
WHERE s.team_org_id = (SELECT org_id FROM teams WHERE ncaa_team_id = ?)
LIMIT 1000`;

const GAME_LIST_SQL = `
SELECT g.internal_id AS id, g.game_date AS date, g.venue, g.away_score AS awayScore, g.home_score AS homeScore,
       away.name AS awayTeam, home.name AS homeTeam, COALESCE(home.sport_code, away.sport_code, 'MBB') AS sportCode,
       CASE COALESCE(home.sport_code, away.sport_code, 'MBB')
         WHEN 'MBB' THEN 's_mbb'
         WHEN 'WBB' THEN 's_wbb'
         WHEN 'MBA' THEN 's_bsb'
         WHEN 'WSB' THEN 's_sfb'
         WHEN 'MFB' THEN 's_fbl'
         WHEN 'MSO' THEN 's_mso'
         WHEN 'WSO' THEN 's_wso'
         ELSE 's_' || lower(substr(COALESCE(home.sport_code, away.sport_code, 'MBB'), 1, 3))
       END AS sportId
FROM games g
LEFT JOIN teams away ON away.ncaa_team_id = g.away_team_id
LEFT JOIN teams home ON home.ncaa_team_id = g.home_team_id
WHERE g.season_label = ?
  AND (? IS NULL OR COALESCE(home.sport_code, away.sport_code) = ?)
  AND (? IS NULL OR g.away_team_id = ? OR g.home_team_id = ?)
  AND (? IS NULL OR date(g.game_date) >= date(?))
  AND (? IS NULL OR date(g.game_date) <= date(?))
ORDER BY g.game_date DESC
LIMIT 500`;

const GAME_DETAIL_SQL = `
SELECT g.internal_id AS id, g.contest_id AS sourceContestId, g.game_date AS date, g.venue, g.attendance, g.away_score AS awayScore, g.home_score AS homeScore,
       away.internal_id AS awayTeamId, away.name AS awayTeam, home.internal_id AS homeTeamId, home.name AS homeTeam,
       COALESCE(home.sport_code, away.sport_code, 'MBB') AS sportCode,
       CASE COALESCE(home.sport_code, away.sport_code, 'MBB')
         WHEN 'MBB' THEN 's_mbb'
         WHEN 'WBB' THEN 's_wbb'
         WHEN 'MBA' THEN 's_bsb'
         WHEN 'WSB' THEN 's_sfb'
         WHEN 'MFB' THEN 's_fbl'
         WHEN 'MSO' THEN 's_mso'
         WHEN 'WSO' THEN 's_wso'
         ELSE 's_' || lower(substr(COALESCE(home.sport_code, away.sport_code, 'MBB'), 1, 3))
       END AS sportId
FROM games g
LEFT JOIN teams away ON away.ncaa_team_id = g.away_team_id
LEFT JOIN teams home ON home.ncaa_team_id = g.home_team_id
WHERE g.internal_id = ?`;

const GAME_PLAYER_STATS_SQL = `
SELECT pgs.*, p.internal_id AS playerId, stats_json AS statsJson, stat_group AS statGroup, sport_code AS sportCode
FROM player_game_stats pgs
LEFT JOIN (SELECT ncaa_player_id, MAX(internal_id) AS internal_id FROM players GROUP BY ncaa_player_id) p ON p.ncaa_player_id = pgs.ncaa_player_id
WHERE pgs.contest_id = ?
ORDER BY team_org_id, stat_group, COALESCE(points, 0) DESC, row_index`;
const GAME_SHOTS_SQL = `
SELECT s.play_id AS id, g.internal_id AS gameId, period, clock, x, y, made, is_three AS isThree,
       shot_value AS shotValue, player_name AS playerName, p.internal_id AS playerId, description
FROM shots s
JOIN games g ON g.contest_id = s.contest_id
LEFT JOIN (SELECT ncaa_player_id, MAX(internal_id) AS internal_id FROM players GROUP BY ncaa_player_id) p ON p.ncaa_player_id = s.ncaa_player_id
WHERE s.contest_id = ?
ORDER BY period, clock DESC`;
const GAME_ACTIONS_SQL = `
SELECT id, sequence, period, clock, team_name AS teamName, player_name AS playerName,
       p.internal_id AS playerId, event_type AS eventType, description,
       away_score AS awayScore, home_score AS homeScore
FROM play_by_play_actions a
LEFT JOIN (SELECT ncaa_player_id, MAX(internal_id) AS internal_id FROM players GROUP BY ncaa_player_id) p ON p.ncaa_player_id = a.ncaa_player_id
WHERE a.contest_id = ?
ORDER BY sequence`;

const PLAYER_LIST_SQL = `
SELECT p.internal_id AS id, MAX(p.name) AS name, COUNT(DISTINCT pgs.contest_id) AS games,
       MAX(pgs.team_name) AS teamName, MAX(pgs.position) AS position, MAX(pgs.sport_code) AS sportCode,
       GROUP_CONCAT(DISTINCT pgs.stat_group) AS statGroups,
       ROUND(AVG(pgs.points), 1) AS ppg,
       ROUND(AVG(pgs.total_rebounds), 1) AS rpg,
       ROUND(AVG(pgs.assists), 1) AS apg
FROM (SELECT ncaa_player_id, MAX(internal_id) AS internal_id, MAX(name) AS name FROM players GROUP BY ncaa_player_id) p
JOIN player_game_stats pgs ON pgs.ncaa_player_id = p.ncaa_player_id
WHERE (? IS NULL OR pgs.team_org_id = (SELECT org_id FROM teams WHERE ncaa_team_id = ?))
  AND (? IS NULL OR pgs.sport_code = ?)
  AND p.name LIKE ?
GROUP BY p.ncaa_player_id
ORDER BY COALESCE(ppg, 0) DESC, games DESC, name ASC`;

const PLAYER_DETAIL_SQL = `SELECT MAX(internal_id) AS id, MAX(name) AS name FROM players WHERE ncaa_player_id = ? GROUP BY ncaa_player_id`;
const PLAYER_SUMMARY_SQL = `
SELECT COUNT(*) AS games, ROUND(AVG(points), 1) AS ppg, ROUND(AVG(total_rebounds), 1) AS rpg,
       ROUND(AVG(assists), 1) AS apg, SUM(fgm) AS fgm, SUM(fga) AS fga,
       SUM(three_fgm) AS threeFgm, SUM(three_fga) AS threeFga, SUM(ftm) AS ftm, SUM(fta) AS fta,
       SUM(turnovers) AS turnovers, SUM(steals) AS steals, SUM(blocks) AS blocks
FROM player_game_stats
WHERE ncaa_player_id = ? AND contest_id IN (/*GAME_IDS*/)`;

const PLAYER_GAME_LOG_SQL = `
SELECT pgs.*, g.internal_id AS id, g.game_date AS date, away.name AS awayTeam, home.name AS homeTeam, g.away_score AS awayScore, g.home_score AS homeScore
FROM player_game_stats pgs
JOIN games g ON g.contest_id = pgs.contest_id
LEFT JOIN teams away ON away.ncaa_team_id = g.away_team_id
LEFT JOIN teams home ON home.ncaa_team_id = g.home_team_id
WHERE pgs.ncaa_player_id = ? AND pgs.contest_id IN (/*GAME_IDS*/)
ORDER BY g.game_date DESC`;

const PLAYER_SHOTS_SQL = `
SELECT s.play_id AS id, g.internal_id AS gameId, period, clock, x, y, made, is_three AS isThree, shot_value AS shotValue, description
FROM shots s
JOIN games g ON g.contest_id = s.contest_id
WHERE s.ncaa_player_id = ? AND s.contest_id IN (/*GAME_IDS*/)
ORDER BY s.contest_id DESC, period, clock DESC`;

const FAVORITE_TEAMS_SQL = `
SELECT t.internal_id AS id, t.name, t.record, uf.created_at AS favoritedAt,
       COUNT(DISTINCT tg.contest_id) AS games
FROM user_favorites uf
JOIN teams t ON t.ncaa_team_id = uf.entity_id
LEFT JOIN team_games tg ON tg.ncaa_team_id = t.ncaa_team_id
WHERE uf.user_id = ? AND uf.favorite_type = 'team'
GROUP BY t.ncaa_team_id, uf.created_at
ORDER BY uf.created_at DESC`;

const FAVORITE_PLAYERS_SQL = `
SELECT p.internal_id AS id, MAX(p.name) AS name, MAX(pgs.team_name) AS teamName,
       ROUND(AVG(pgs.points), 1) AS ppg, uf.created_at AS favoritedAt
FROM user_favorites uf
JOIN (SELECT ncaa_player_id, MAX(internal_id) AS internal_id, MAX(name) AS name FROM players GROUP BY ncaa_player_id) p ON p.ncaa_player_id = uf.entity_id
LEFT JOIN player_game_stats pgs ON pgs.ncaa_player_id = p.ncaa_player_id
WHERE uf.user_id = ? AND uf.favorite_type = 'player'
GROUP BY p.ncaa_player_id, uf.created_at
ORDER BY uf.created_at DESC`;

const ADMIN_SCRAPE_LOGS_SQL = `
SELECT id, url, cache_key AS cacheKey, status_code AS statusCode, fetched_at AS fetchedAt, error
FROM scrape_logs
ORDER BY datetime(fetched_at) DESC, id DESC
LIMIT ? OFFSET ?`;

const ADMIN_GAMES_SQL = `
SELECT g.internal_id AS id, g.game_date AS date, g.scrape_status AS status,
       away.name AS awayTeam, home.name AS homeTeam,
       COALESCE(home.sport_code, away.sport_code, 'MBB') AS sportCode,
       COALESCE(home.division, away.division, '1') AS division
FROM games g
LEFT JOIN teams away ON away.ncaa_team_id = g.away_team_id
LEFT JOIN teams home ON home.ncaa_team_id = g.home_team_id
WHERE (? IS NULL OR g.scrape_status = ?)
  AND (? IS NULL OR COALESCE(home.division, away.division, '1') = ?)
  AND (? IS NULL OR COALESCE(home.sport_code, away.sport_code, 'MBB') = ?)
ORDER BY datetime(g.game_date) DESC, g.contest_id DESC
LIMIT ? OFFSET ?`;

const ADMIN_GAMES_COUNT_SQL = `
SELECT COUNT(*) AS total
FROM games g
LEFT JOIN teams away ON away.ncaa_team_id = g.away_team_id
LEFT JOIN teams home ON home.ncaa_team_id = g.home_team_id
WHERE (? IS NULL OR g.scrape_status = ?)
  AND (? IS NULL OR COALESCE(home.division, away.division, '1') = ?)
  AND (? IS NULL OR COALESCE(home.sport_code, away.sport_code, 'MBB') = ?)`;

const ADMIN_DIVISION_SUMMARY_SQL = `
SELECT COALESCE(t.division, '1') AS division,
       COUNT(DISTINCT t.ncaa_team_id) AS teams,
       COUNT(DISTINCT tg.contest_id) AS teamGames
FROM teams t
LEFT JOIN team_games tg ON tg.ncaa_team_id = t.ncaa_team_id
GROUP BY COALESCE(t.division, '1')
ORDER BY division`;

const ADMIN_SCRAPE_JOBS_SQL = `
SELECT id, mode, season_label AS season, division, seed_team_id AS seedTeamId, contest_id AS contestId,
       max_teams AS maxTeams, game_limit AS gameLimit, status, runner_type AS runnerType, message,
       created_at AS createdAt, started_at AS startedAt, finished_at AS finishedAt, updated_at AS updatedAt
FROM scrape_jobs
WHERE (? IS NULL OR status = ?)
ORDER BY datetime(created_at) DESC, id DESC
LIMIT ? OFFSET ?`;

const INGEST_TABLES = {
  seasons: {
    columns: ["id", "internal_id", "label", "sport_code", "division", "created_at"],
  },
  teams: {
    columns: ["ncaa_team_id", "internal_id", "org_id", "name", "season_label", "sport_code", "division", "record", "updated_at"],
  },
  games: {
    columns: [
      "contest_id",
      "internal_id",
      "season_label",
      "game_date",
      "venue",
      "attendance",
      "away_team_id",
      "home_team_id",
      "away_org_id",
      "home_org_id",
      "away_score",
      "home_score",
      "scrape_status",
      "last_scraped_at",
      "created_at",
      "updated_at",
    ],
  },
  team_games: {
    columns: [
      "id",
      "contest_id",
      "ncaa_team_id",
      "opponent_team_id",
      "game_date",
      "result",
      "attendance",
      "is_away",
      "neutral_site",
    ],
  },
  players: {
    columns: ["player_internal_id", "internal_id", "ncaa_player_id", "name"],
  },
  player_game_stats: {
    columns: [
      "id",
      "contest_id",
      "team_org_id",
      "team_name",
      "player_internal_id",
      "ncaa_player_id",
      "player_name",
      "sport_code",
      "stat_group",
      "table_index",
      "row_index",
      "stats_json",
      "jersey_number",
      "position",
      "minutes",
      "fgm",
      "fga",
      "fg_pct",
      "three_fgm",
      "three_fga",
      "ftm",
      "fta",
      "points",
      "offensive_rebounds",
      "defensive_rebounds",
      "total_rebounds",
      "assists",
      "turnovers",
      "steals",
      "blocks",
      "fouls",
      "disqualifications",
      "technical_fouls",
      "bench_points",
    ],
  },
  play_by_play_actions: {
    columns: [
      "id",
      "contest_id",
      "sequence",
      "period",
      "clock",
      "team_org_id",
      "team_name",
      "player_internal_id",
      "ncaa_player_id",
      "player_name",
      "event_type",
      "description",
      "home_score",
      "away_score",
    ],
  },
  shots: {
    columns: [
      "play_id",
      "contest_id",
      "sequence",
      "period",
      "clock",
      "team_org_id",
      "player_internal_id",
      "ncaa_player_id",
      "player_name",
      "x",
      "y",
      "made",
      "is_three",
      "shot_value",
      "description",
      "classes",
    ],
  },
  scrape_logs: {
    columns: ["id", "url", "cache_key", "status_code", "fetched_at", "error"],
  },
} as const;

export default app;
