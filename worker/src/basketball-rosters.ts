import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { researchDb } from "./research-db";

const querySchema = z.object({
  season: z.coerce.number().int().min(2025).max(2035).default(2027),
  status: z.enum(["all", "same_program", "different_program", "new_to_dataset", "ambiguous"]).default("all"),
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
});

type RosterRow = { team_id: string; athlete_id: string; profile_json: string };
type ParticipationRow = {
  team_id: string;
  athlete_id: string;
  name: string | null;
  games: number | null;
  minutes: number | null;
};

const readProfile = (value: string): Record<string, unknown> => {
  try {
    const profile = JSON.parse(value);
    return profile && typeof profile === "object" ? profile as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

/**
 * Return the current roster observation directly from the research warehouse.
 * The static release remains the fallback, while this endpoint keeps the
 * recruiting desk from showing an older source listing after a refresh.
 */
export const basketballRosters = new Hono<{ Bindings: Env }>();

basketballRosters.get("/", zValidator("query", querySchema), async (c) => {
  const { season, status, limit } = c.req.valid("query");
  const previousSeason = season - 1;
  const sourceDataset = season === 2026 ? "player_box" : "rosters";
  const db = researchDb(c.env);

  const [currentRoster, previousRoster, previousParticipation, currentParticipation, teams, source] = await Promise.all([
    db.prepare("SELECT team_id,athlete_id,profile_json FROM bb_rosters WHERE season=? ORDER BY team_id,athlete_id").bind(season).all<RosterRow>(),
    db.prepare("SELECT team_id,athlete_id,profile_json FROM bb_rosters WHERE season=? ORDER BY team_id,athlete_id").bind(previousSeason).all<RosterRow>(),
    db.prepare("SELECT team_id,athlete_id,name,games,minutes FROM bb_participation WHERE season=? ORDER BY team_id,athlete_id").bind(previousSeason).all<ParticipationRow>(),
    db.prepare("SELECT team_id,athlete_id,name,games,minutes FROM bb_participation WHERE season=? ORDER BY team_id,athlete_id").bind(season).all<ParticipationRow>(),
    db.prepare("SELECT team_id,team_name FROM bb_team_season WHERE season IN (?,?) AND team_name IS NOT NULL").bind(previousSeason, season).all<{ team_id: string; team_name: string }>(),
    db.prepare("SELECT receipt_json FROM bb_sources WHERE dataset=? AND season=?").bind(sourceDataset, season).first<{ receipt_json: string }>(),
  ]);

  // The 2025–26 view is a recorded participation view, matching the local
  // publisher's target=2026 behavior. Future views use source roster rows.
  const currentRows = season === 2026
    ? currentParticipation.results.map((row) => ({
        team_id: row.team_id,
        athlete_id: row.athlete_id,
        profile: { full_name: row.name || row.athlete_id } as Record<string, unknown>,
      }))
    : currentRoster.results.map((row) => ({ ...row, profile: readProfile(row.profile_json) }));
  const oldByAthlete = new Map<string, ParticipationRow[]>();
  for (const row of previousParticipation.results) {
    const values = oldByAthlete.get(row.athlete_id) || [];
    values.push(row);
    oldByAthlete.set(row.athlete_id, values);
  }
  const oldRosterByAthlete = new Map<string, RosterRow[]>();
  for (const row of previousRoster.results) {
    const values = oldRosterByAthlete.get(row.athlete_id) || [];
    values.push(row);
    oldRosterByAthlete.set(row.athlete_id, values);
  }
  const teamNames = new Map<string, string>();
  for (const row of teams.results) teamNames.set(row.team_id, row.team_name);
  for (const row of [...previousRoster.results, ...currentRoster.results]) {
    const profile = readProfile(row.profile_json);
    const name = profile.team_display_name;
    if (typeof name === "string" && name) teamNames.set(row.team_id, name);
  }
  const currentTeamsByAthlete = new Map<string, Set<string>>();
  for (const row of currentRows) {
    const ids = currentTeamsByAthlete.get(row.athlete_id) || new Set<string>();
    ids.add(row.team_id);
    currentTeamsByAthlete.set(row.athlete_id, ids);
  }

  const statusCounts: Record<string, number> = {};
  let unusableRows = 0;
  const players = currentRows.flatMap(({ team_id, athlete_id, profile }) => {
    const name = typeof profile.full_name === "string" ? profile.full_name.trim() : "";
    if (!name || name.toLowerCase() === "team") {
      unusableRows += 1;
      return [];
    }
    const old = oldByAthlete.get(athlete_id) || [];
    const oldIds = new Set(old.map((row) => row.team_id));
    const currentIds = currentTeamsByAthlete.get(athlete_id) || new Set<string>();
    const status = currentIds.size > 1
      ? "ambiguous"
      : oldIds.has(team_id)
        ? "same_program"
        : oldIds.size
          ? "different_program"
          : "new_to_dataset";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    const oldProfiles = oldRosterByAthlete.get(athlete_id) || [];
    const previousTeams = [...oldIds].map((id) => {
      const profile = oldProfiles.find((row) => row.team_id === id);
      const candidate = profile ? readProfile(profile.profile_json).team_display_name : null;
      return typeof candidate === "string" && candidate ? candidate : teamNames.get(id) || id;
    }).sort();
    const sourceUrl = profile.link_web;
    const previousGames = old.reduce((sum, row) => sum + Number(row.games || 0), 0);
    const previousMinutes = old.reduce((sum, row) => sum + Number(row.minutes || 0), 0);
    return [{
      id: athlete_id,
      name,
      team_id,
      team: typeof profile.team_display_name === "string" && profile.team_display_name ? profile.team_display_name : teamNames.get(team_id) || team_id,
      previous_teams: previousTeams,
      status,
      previous_games: Number.isFinite(previousGames) ? previousGames : null,
      previous_minutes: Number.isFinite(previousMinutes) ? Math.round(previousMinutes * 10) / 10 : null,
      position: typeof profile.position_abbreviation === "string" ? profile.position_abbreviation : null,
      class_year: typeof profile.experience_display_value === "string" ? profile.experience_display_value : null,
      height: typeof profile.height === "string" ? profile.height : null,
      weight: typeof profile.weight === "string" ? profile.weight : null,
      source_url: typeof sourceUrl === "string" ? sourceUrl : null,
    }];
  });

  const priorMinutesByTeam = new Map<string, number>();
  const priorMinutesByPlayerTeam = new Map<string, number>();
  for (const row of previousParticipation.results) {
    const minutes = Number(row.minutes || 0);
    if (!Number.isFinite(minutes) || minutes < 0) continue;
    priorMinutesByTeam.set(row.team_id, (priorMinutesByTeam.get(row.team_id) || 0) + minutes);
    priorMinutesByPlayerTeam.set(`${row.athlete_id}:${row.team_id}`, minutes);
  }
  const teamRows = new Map<string, typeof players>();
  for (const player of players) {
    const values = teamRows.get(player.team_id) || [];
    values.push(player);
    teamRows.set(player.team_id, values);
  }
  const teamSummaries = [...teamRows.entries()].map(([team_id, rows]) => {
    const returning = rows.filter((row) => row.status === "same_program");
    const transfers = rows.filter((row) => row.status === "different_program");
    const incoming = transfers.reduce((sum, row) => sum + (oldByAthlete.get(row.id) || []).reduce((value, prior) => value + Number(prior.minutes || 0), 0), 0);
    const returningMinutes = returning.reduce((sum, row) => sum + (priorMinutesByPlayerTeam.get(`${row.id}:${team_id}`) || 0), 0);
    const priorMinutes = priorMinutesByTeam.get(team_id) || 0;
    const represented = returningMinutes + incoming;
    return {
      team_id,
      team: rows[0]?.team || teamNames.get(team_id) || team_id,
      listed_players: rows.length,
      returning_players: returning.length,
      transfer_players: transfers.length,
      new_players: rows.filter((row) => row.status === "new_to_dataset").length,
      ambiguous_players: rows.filter((row) => row.status === "ambiguous").length,
      prior_minutes: Math.round(priorMinutes * 10) / 10,
      returning_minutes: Math.round(returningMinutes * 10) / 10,
      incoming_prior_minutes: Math.round(incoming * 10) / 10,
      represented_prior_minutes: Math.round(represented * 10) / 10,
      unrepresented_prior_minutes: Math.round(Math.max(priorMinutes - represented, 0) * 10) / 10,
      returning_minutes_share: priorMinutes ? Math.round((returningMinutes / priorMinutes) * 10000) / 10000 : null,
      represented_prior_minutes_share: priorMinutes ? Math.round((represented / priorMinutes) * 10000) / 10000 : null,
    };
  }).sort((a, b) => a.team.localeCompare(b.team));

  const filteredPlayers = (status === "all" ? players : players.filter((player) => player.status === status)).slice(0, limit);

  let receipt: Record<string, unknown> | null = null;
  try { receipt = source?.receipt_json ? JSON.parse(source.receipt_json) as Record<string, unknown> : null; } catch { receipt = null; }
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    season,
    previous_season: previousSeason,
    basis: season === 2027 ? "Prior-season recorded appearances versus unconfirmed source roster listings" : "Prior-season recorded appearances versus recorded appearances",
    teams_observed: teamRows.size,
    players_observed: new Set(players.map((player) => player.id)).size,
    prior_players_not_observed: Math.max(new Set(previousParticipation.results.map((row) => row.athlete_id)).size - new Set(players.map((player) => player.id)).size, 0),
    unusable_rows: unusableRows,
    status_counts: statusCounts,
    team_summaries: teamSummaries,
    players: filteredPlayers,
    player_filter: { status, limit },
    source: receipt ? { dataset: sourceDataset, url: receipt.url ?? null, fetched_at: receipt.fetched_at ?? null, sha256: receipt.sha256 ?? null } : null,
  });
});
