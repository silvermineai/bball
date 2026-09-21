import { describe, expect, it } from "vitest";
import { footballDivisionCoverage } from "./football-coverage";

describe("football division coverage", () => {
  it("counts cross-division games once for each involved division", () => {
    const coverage = footballDivisionCoverage(
      [
        { id: "same", home_division: "fbs", away_division: "fbs", prediction: {} },
        { id: "cross", home_division: "fbs", away_division: "fcs", prediction: null },
        { id: "lower", home_id: "d2-home", away_id: "d3-away", home_division: "ii", away_division: "iii", prediction: null },
      ],
      [
        { id: "p1", team_id: "t1", division: "fbs" },
        { id: "p1", team_id: "t1", division: "fbs" },
        { id: "p2", team_id: "t2", division: "fcs" },
      ],
    );

    expect(coverage).toEqual([
      {
        division: "fbs",
        player_stats_available: true,
        player_records: 2,
        players: 1,
        observed_player_stats_available: false,
        observed_player_records: 0,
        observed_players: 0,
        teams: 1,
        upcoming_games: 2,
        forecast_games: 1,
        games_without_forecast: 1,
      },
      {
        division: "fcs",
        player_stats_available: true,
        player_records: 1,
        players: 1,
        observed_player_stats_available: false,
        observed_player_records: 0,
        observed_players: 0,
        teams: 1,
        upcoming_games: 1,
        forecast_games: 0,
        games_without_forecast: 1,
      },
      {
        division: "d2",
        player_stats_available: false,
        player_records: 0,
        players: 0,
        observed_player_stats_available: false,
        observed_player_records: 0,
        observed_players: 0,
        teams: 1,
        upcoming_games: 1,
        forecast_games: 0,
        games_without_forecast: 1,
      },
      {
        division: "d3",
        player_stats_available: false,
        player_records: 0,
        players: 0,
        observed_player_stats_available: false,
        observed_player_records: 0,
        observed_players: 0,
        teams: 1,
        upcoming_games: 1,
        forecast_games: 0,
        games_without_forecast: 1,
      },
    ]);
  });

  it("does not invent rows for an unavailable division", () => {
    expect(
      footballDivisionCoverage([], [], ["d2", "d3"]),
    ).toEqual([
      {
        division: "d2",
        player_stats_available: false,
        player_records: 0,
        players: 0,
        observed_player_stats_available: false,
        observed_player_records: 0,
        observed_players: 0,
        teams: 0,
        upcoming_games: 0,
        forecast_games: 0,
        games_without_forecast: 0,
      },
      {
        division: "d3",
        player_stats_available: false,
        player_records: 0,
        players: 0,
        observed_player_stats_available: false,
        observed_player_records: 0,
        observed_players: 0,
        teams: 0,
        upcoming_games: 0,
        forecast_games: 0,
        games_without_forecast: 0,
      },
    ]);
  });

  it("keeps observed lower-division player counts separate from the canonical edition", () => {
    const coverage = footballDivisionCoverage(
      [],
      [],
      ["d2", "d3"],
      [
        { id: "athlete-1", team_id: "team-1", division: "d2" },
        { id: "athlete-1", team_id: "team-1", division: "d2" },
        { id: "athlete-2", team_id: "team-2", division: "d3" },
      ],
    );

    expect(coverage.map((row) => ({
      division: row.division,
      player_stats_available: row.player_stats_available,
      players: row.players,
      observed_player_stats_available: row.observed_player_stats_available,
      observed_player_records: row.observed_player_records,
      observed_players: row.observed_players,
    }))).toEqual([
      { division: "d2", player_stats_available: false, players: 0, observed_player_stats_available: true, observed_player_records: 2, observed_players: 1 },
      { division: "d3", player_stats_available: false, players: 0, observed_player_stats_available: true, observed_player_records: 1, observed_players: 1 },
    ]);
  });
});
