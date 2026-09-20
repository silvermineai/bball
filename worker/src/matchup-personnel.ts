import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { researchDb } from "./research-db";

type Bindings = Env;

const querySchema = z.object({
  season: z.coerce.number().int().min(2025).max(2035).default(2027),
  gameId: z.string().regex(/^\d{1,20}$/),
});

type GameRow = {
  id: string;
  season: number;
  starts_at: string;
  home_id: string;
  away_id: string;
  home_name: string | null;
  away_name: string | null;
  completed: number;
};

type RosterRow = {
  team_id: string;
  athlete_id: string;
  profile_json: string;
};

type ParticipationRow = {
  team_id: string;
  team_name: string | null;
  athlete_id: string;
  name: string | null;
  games: number | null;
  minutes: number | null;
};

type StatsRow = {
  team_id: string;
  athlete_id: string;
  stats_json: string;
};

type ValueRow = {
  team_id: string;
  player_id: string;
  stats_json: string;
};

type RecruitingRow = {
  athlete_id: string;
  rank: number | null;
  position_rank: number | null;
  grade: number | null;
  status: string | null;
  captured_at: string | null;
  source_sha256: string | null;
};

const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("matchup personnel query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

function object(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sourceStat(stats: Record<string, unknown>, category: string, key: string): number | null {
  const group = stats[category];
  if (!group || typeof group !== "object" || Array.isArray(group)) return null;
  const field = (group as Record<string, unknown>)[key];
  if (!field || typeof field !== "object" || Array.isArray(field)) return null;
  return number((field as Record<string, unknown>).value);
}

function sourceDisplay(stats: Record<string, unknown>, category: string, key: string): string | null {
  const group = stats[category];
  if (!group || typeof group !== "object" || Array.isArray(group)) return null;
  const field = (group as Record<string, unknown>)[key];
  if (!field || typeof field !== "object" || Array.isArray(field)) return null;
  return text((field as Record<string, unknown>).display);
}

function profileName(profile: Record<string, unknown>): string | null {
  return text(profile.full_name) || text(profile.display_name);
}

function sourceMetrics(stats: Record<string, unknown>) {
  return {
    ppg: sourceStat(stats, "averages", "avgPoints"),
    rpg: sourceStat(stats, "averages", "avgRebounds"),
    apg: sourceStat(stats, "averages", "avgAssists"),
    spg: sourceStat(stats, "averages", "avgSteals"),
    bpg: sourceStat(stats, "averages", "avgBlocks"),
    mpg: sourceStat(stats, "averages", "avgMinutes"),
    fg_pct: sourceStat(stats, "averages", "fieldGoalPct"),
    three_pct: sourceStat(stats, "averages", "threePointFieldGoalPct"),
    ft_pct: sourceStat(stats, "averages", "freeThrowPct"),
    field_goals: sourceDisplay(stats, "averages", "avgFieldGoalsMade-avgFieldGoalsAttempted"),
    three_pointers: sourceDisplay(stats, "averages", "avgThreePointFieldGoalsMade-avgThreePointFieldGoalsAttempted"),
    free_throws: sourceDisplay(stats, "averages", "avgFreeThrowsMade-avgFreeThrowsAttempted"),
  };
}

export const matchupPersonnel = new Hono<{ Bindings: Bindings }>();

/**
 * Explain an upcoming matchup with the exact current roster identities used by
 * the roster-continuity model and their retained prior-season workload. Stints
 * stay separate so transfers and multi-team seasons are never silently merged
 * into a source stat line.
 */
matchupPersonnel.get("/", zValidator("query", querySchema), async (c) => {
  const { season, gameId } = c.req.valid("query");
  const priorSeason = season - 1;
  const db = researchDb(c.env);
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make exact roster evidence fail.
    }
  }

  try {
    const game = await withTimeout(db.prepare(
      "SELECT id,season,starts_at,home_id,away_id,home_name,away_name,completed FROM bb_games WHERE id=? AND season=?",
    ).bind(gameId, season).first<GameRow>(), DB_TIMEOUT_MS);
    if (!game) return c.json({ error: "Matchup not found for the requested season." }, 404);

    const rosterIdentity = `SELECT athlete_id FROM bb_rosters WHERE season=? AND team_id IN (?,?)`;
    const [rosters, participation, playerStats, playerValues, receipts, recruiting] = await withTimeout(Promise.all([
      db.prepare(
        "SELECT team_id,athlete_id,profile_json FROM bb_rosters WHERE season=? AND team_id IN (?,?) ORDER BY team_id,athlete_id",
      ).bind(season, game.home_id, game.away_id).all<RosterRow>(),
      db.prepare(
        `SELECT p.team_id,t.team_name,p.athlete_id,p.name,p.games,p.minutes
           FROM bb_participation p
           LEFT JOIN bb_team_season t ON t.season=p.season AND t.team_id=p.team_id
          WHERE p.season=? AND p.athlete_id IN (${rosterIdentity})
          ORDER BY p.athlete_id,p.team_id`,
      ).bind(priorSeason, season, game.home_id, game.away_id).all<ParticipationRow>(),
      db.prepare(
        `SELECT s.team_id,s.athlete_id,s.stats_json
           FROM bb_player_season s
          WHERE s.season=? AND s.athlete_id IN (${rosterIdentity})
          ORDER BY s.athlete_id,s.team_id`,
      ).bind(priorSeason, season, game.home_id, game.away_id).all<StatsRow>(),
      db.prepare(
        `SELECT v.team_id,v.player_id,v.stats_json
           FROM bb_player_value v
          WHERE v.season=? AND v.player_id IN (${rosterIdentity})
          ORDER BY v.player_id,v.team_id`,
      ).bind(priorSeason, season, game.home_id, game.away_id).all<ValueRow>(),
      db.prepare(
        "SELECT dataset,season,json_extract(receipt_json,'$.fetched_at') AS fetched_at,json_extract(receipt_json,'$.sha256') AS sha256 FROM bb_sources WHERE season IN (?,?) AND dataset IN ('rosters','player_box','player_season','publisher_player_value') ORDER BY season,dataset",
      ).bind(priorSeason, season).all(),
      db.prepare(
        `SELECT r.athlete_id,r.rank,r.position_rank,r.grade,r.status,r.captured_at,r.source_sha256
           FROM bb_espn_recruiting r
           JOIN bb_espn_recruiting_current current_release
             ON current_release.season=r.season AND current_release.edition=r.edition
          WHERE r.season=? AND r.athlete_id IN (${rosterIdentity})
          ORDER BY r.athlete_id`,
      ).bind(season, season, game.home_id, game.away_id).all<RecruitingRow>(),
    ]), DB_TIMEOUT_MS);

    const participationByAthlete = new Map<string, ParticipationRow[]>();
    for (const row of participation.results) {
      const values = participationByAthlete.get(row.athlete_id) || [];
      values.push(row);
      participationByAthlete.set(row.athlete_id, values);
    }
    const statsByAthleteTeam = new Map(playerStats.results.map((row) => [`${row.athlete_id}:${row.team_id}`, object(row.stats_json)]));
    const valueByAthleteTeam = new Map(playerValues.results.map((row) => [`${row.player_id}:${row.team_id}`, object(row.stats_json)]));
    const recruitingByAthlete = new Map(recruiting.results.map((row) => [row.athlete_id, row]));
    const currentTeamsByAthlete = new Map<string, Set<string>>();
    for (const row of rosters.results) {
      const teams = currentTeamsByAthlete.get(row.athlete_id) || new Set<string>();
      teams.add(row.team_id);
      currentTeamsByAthlete.set(row.athlete_id, teams);
    }

    const players = rosters.results.flatMap((row) => {
      const profile = object(row.profile_json);
      const priorRows = participationByAthlete.get(row.athlete_id) || [];
      const priorTeamIds = new Set(priorRows.map((prior) => prior.team_id));
      const currentTeamIds = currentTeamsByAthlete.get(row.athlete_id) || new Set<string>();
      const status = currentTeamIds.size > 1
        ? "ambiguous"
        : priorTeamIds.has(row.team_id)
          ? "returning"
          : priorTeamIds.size
            ? "incoming"
            : "new_to_dataset";
      const stints = priorRows.map((prior) => {
        const stats = statsByAthleteTeam.get(`${row.athlete_id}:${prior.team_id}`) || {};
        const value = valueByAthleteTeam.get(`${row.athlete_id}:${prior.team_id}`) || {};
        return {
          team_id: prior.team_id,
          team: prior.team_name || prior.team_id,
          games: number(prior.games),
          minutes: number(prior.minutes),
          stats: sourceMetrics(stats),
          box_bpm: number(value.box_bpm),
          box_obpm: number(value.box_obpm),
          box_dbpm: number(value.box_dbpm),
        };
      });
      const observedMinutes = stints.map((stint) => stint.minutes).filter((value): value is number => value != null);
      const observedGames = stints.map((stint) => stint.games).filter((value): value is number => value != null);
      const name = profileName(profile) || priorRows.map((prior) => text(prior.name)).find(Boolean) || row.athlete_id;
      if (name.toLowerCase() === "team") return [];
      const recruitingRow = recruitingByAthlete.get(row.athlete_id);
      return [{
        team_id: row.team_id,
        athlete_id: row.athlete_id,
        name,
        position: text(profile.position_abbreviation),
        class_year: text(profile.experience_display_value),
        height: text(profile.height),
        status,
        recruiting: recruitingRow ? {
          season,
          rank: number(recruitingRow.rank),
          position_rank: number(recruitingRow.position_rank),
          grade: number(recruitingRow.grade),
          status: text(recruitingRow.status),
          captured_at: text(recruitingRow.captured_at),
          source_sha256: text(recruitingRow.source_sha256),
        } : null,
        prior_games: observedGames.length ? observedGames.reduce((sum, value) => sum + value, 0) : null,
        prior_minutes: observedMinutes.length ? Math.round(observedMinutes.reduce((sum, value) => sum + value, 0) * 10) / 10 : null,
        prior_stints: stints,
      }];
    });

    const side = (teamId: string, teamName: string | null) => {
      const sidePlayers = players
        .filter((player) => player.team_id === teamId)
        .sort((a, b) => (b.prior_minutes ?? -1) - (a.prior_minutes ?? -1) || a.name.localeCompare(b.name));
      return {
        team_id: teamId,
        team: teamName || teamId,
        listed_players: sidePlayers.length,
        returning_players: sidePlayers.filter((player) => player.status === "returning").length,
        incoming_players: sidePlayers.filter((player) => player.status === "incoming").length,
        new_to_dataset_players: sidePlayers.filter((player) => player.status === "new_to_dataset").length,
        ambiguous_players: sidePlayers.filter((player) => player.status === "ambiguous").length,
        players_with_prior_minutes: sidePlayers.filter((player) => player.prior_minutes != null).length,
        players_with_publisher_stats: sidePlayers.filter((player) => player.prior_stints.some((stint) => Object.values(stint.stats).some((value) => value != null))).length,
        players_with_box_bpm: sidePlayers.filter((player) => player.prior_stints.some((stint) => stint.box_bpm != null)).length,
        players: sidePlayers,
      };
    };

    const home = side(game.home_id, game.home_name);
    const away = side(game.away_id, game.away_name);
    const response = c.json({
      season,
      prior_season: priorSeason,
      game: {
        id: game.id,
        starts_at: game.starts_at,
        completed: Boolean(game.completed),
        home_id: game.home_id,
        away_id: game.away_id,
        home_name: game.home_name,
        away_name: game.away_name,
      },
      coverage: {
        listed_players: home.listed_players + away.listed_players,
        players_with_prior_minutes: home.players_with_prior_minutes + away.players_with_prior_minutes,
        players_with_publisher_stats: home.players_with_publisher_stats + away.players_with_publisher_stats,
        players_with_box_bpm: home.players_with_box_bpm + away.players_with_box_bpm,
      },
      home,
      away,
      source_receipts: receipts.results.map((row) => ({
        dataset: String((row as { dataset?: unknown }).dataset || ""),
        season: Number((row as { season?: unknown }).season),
        fetched_at: text((row as { fetched_at?: unknown }).fetched_at),
        sha256: text((row as { sha256?: unknown }).sha256),
      })),
      identity_policy: "Current and prior roster evidence is joined only by the retained source athlete ID. Prior-team stints remain separate; missing metrics remain null.",
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch {
    return c.json({ error: "The matchup personnel archive is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
