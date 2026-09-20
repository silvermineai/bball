import { describe, expect, it } from "vitest";
import { footballDivisionCoverage } from "./football-coverage";

describe("football division coverage", () => {
  it("counts cross-division games once for each involved division", () => {
    const coverage = footballDivisionCoverage(
      [
        { id: "same", home_division: "fbs", away_division: "fbs", prediction: {} },
        { id: "cross", home_division: "fbs", away_division: "fcs", prediction: null },
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
        player_records: 2,
        players: 1,
        teams: 1,
        upcoming_games: 2,
        forecast_games: 1,
        games_without_forecast: 1,
      },
      {
        division: "fcs",
        player_records: 1,
        players: 1,
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
        player_records: 0,
        players: 0,
        teams: 0,
        upcoming_games: 0,
        forecast_games: 0,
        games_without_forecast: 0,
      },
      {
        division: "d3",
        player_records: 0,
        players: 0,
        teams: 0,
        upcoming_games: 0,
        forecast_games: 0,
        games_without_forecast: 0,
      },
    ]);
  });
});
