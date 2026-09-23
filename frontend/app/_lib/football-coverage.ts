export type FootballCoverageGame = {
  id: string;
  home_id?: string;
  away_id?: string;
  home_division: string;
  away_division: string;
  prediction: unknown | null;
};

export type FootballCoveragePlayer = {
  id: string;
  team_id: string;
  division: string;
};

export type FootballDivisionCoverage = {
  division: string;
  /** False means the retained player edition has no rows for this division. */
  player_stats_available: boolean;
  player_records: number;
  players: number;
  /** Exact-ID rows from a separate observed lower-division game archive. */
  observed_player_stats_available: boolean;
  observed_player_records: number;
  observed_players: number;
  teams: number;
  upcoming_games: number;
  forecast_games: number;
  games_without_forecast: number;
};

/** Keep the hero's division forecast links on the same exact-scope matchup desk. */
export function footballDivisionMatchupHref(division: string): string {
  const normalized = canonicalDivision(division);
  return normalized === "fbs"
    ? "/football/matchups/"
    : `/football/matchups/?division=${encodeURIComponent(normalized)}`;
}

const DIVISION_ALIASES: Record<string, string> = {
  ii: "d2",
  "d-ii": "d2",
  "division ii": "d2",
  iii: "d3",
  "d-iii": "d3",
  "division iii": "d3",
};

function canonicalDivision(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return DIVISION_ALIASES[normalized] || normalized;
}

/**
 * Build the dashboard's division coverage from the exact published editions.
 * A cross-division game is counted once for each division it involves; this
 * makes the FCS row useful while keeping the denominator explicit in the UI.
 */
export function footballDivisionCoverage(
  games: FootballCoverageGame[],
  players: FootballCoveragePlayer[],
  divisions = ["fbs", "fcs", "d2", "d3"],
  observedPlayers: FootballCoveragePlayer[] = [],
): FootballDivisionCoverage[] {
  return divisions.map((division) => {
    const divisionPlayers = players.filter((player) => canonicalDivision(player.division) === division);
    const divisionObservedPlayers = observedPlayers.filter((player) => canonicalDivision(player.division) === division);
    const divisionGames = games.filter((game) =>
      new Set([canonicalDivision(game.home_division), canonicalDivision(game.away_division)]).has(division),
    );
    const playerIds = new Set(divisionPlayers.map((player) => player.id));
    const teamIds = new Set(divisionPlayers.map((player) => player.team_id));
    // Schedule coverage remains useful even while a division's player
    // edition is unavailable. Count teams from the published game identity;
    // never manufacture player rows from this fallback.
    for (const game of divisionGames) {
      if (canonicalDivision(game.home_division) === division && game.home_id) teamIds.add(game.home_id);
      if (canonicalDivision(game.away_division) === division && game.away_id) teamIds.add(game.away_id);
    }
    const forecastGames = divisionGames.filter((game) => game.prediction != null).length;
    return {
      division,
      player_stats_available: divisionPlayers.length > 0,
      player_records: divisionPlayers.length,
      players: playerIds.size,
      observed_player_stats_available: divisionObservedPlayers.length > 0,
      observed_player_records: divisionObservedPlayers.length,
      observed_players: new Set(divisionObservedPlayers.map((player) => player.id)).size,
      teams: teamIds.size,
      upcoming_games: divisionGames.length,
      forecast_games: forecastGames,
      games_without_forecast: divisionGames.length - forecastGames,
    };
  });
}
