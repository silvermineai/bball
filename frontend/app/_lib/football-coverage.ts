export type FootballCoverageGame = {
  id: string;
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
  player_records: number;
  players: number;
  teams: number;
  upcoming_games: number;
  forecast_games: number;
  games_without_forecast: number;
};

/**
 * Build the dashboard's division coverage from the exact published editions.
 * A cross-division game is counted once for each division it involves; this
 * makes the FCS row useful while keeping the denominator explicit in the UI.
 */
export function footballDivisionCoverage(
  games: FootballCoverageGame[],
  players: FootballCoveragePlayer[],
  divisions = ["fbs", "fcs"],
): FootballDivisionCoverage[] {
  return divisions.map((division) => {
    const divisionPlayers = players.filter((player) => player.division === division);
    const divisionGames = games.filter((game) =>
      new Set([game.home_division, game.away_division]).has(division),
    );
    const playerIds = new Set(divisionPlayers.map((player) => player.id));
    const teamIds = new Set(divisionPlayers.map((player) => player.team_id));
    const forecastGames = divisionGames.filter((game) => game.prediction != null).length;
    return {
      division,
      player_records: divisionPlayers.length,
      players: playerIds.size,
      teams: teamIds.size,
      upcoming_games: divisionGames.length,
      forecast_games: forecastGames,
      games_without_forecast: divisionGames.length - forecastGames,
    };
  });
}
