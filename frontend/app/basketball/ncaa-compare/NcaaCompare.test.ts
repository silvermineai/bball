import { describe, expect, it } from "vitest";
import { comparisonPossessionContext, comparisonShotLocations } from "./NcaaCompare";

describe("NCAA comparison possession evidence", () => {
  it("keeps comparison shot locations exact to the requested season and player", () => {
    const shots = comparisonShotLocations({ shooting: [
      { season: 2026, team_id: "7", team_name: "Alpha", stats: { attempts: 2, coordinates: [["game-1", -4, 8, 9, "paint", "jump", true, 2], ["game-2", null, null, null, "unknown", null, false, 2]] } },
      { season: 2025, team_id: "7", team_name: "Alpha", stats: { attempts: 1, coordinates: [["old", 1, 1, 1, "rim", "layup", true, 2]] } },
    ] }, 2026, "42");
    expect(shots).toHaveLength(2);
    expect(shots[0]).toMatchObject({ player: "42", game: "game-1", x: -4, y: 8 });
    expect(shots[1]).toMatchObject({ player: "42", game: "game-2", location_status: "missing" });
  });

  it("pools complete exact-ID team stints and exposes the recorded denominators", () => {
    const result = comparisonPossessionContext([
      { season: 2026, team_id: "7", team_name: "Alpha", player_name: "One", games: 10, stats: { pts: 120, o_poss: 200, ast: 30, tov: 20, fga: 100, tpa: 40, tpm: 15, fta: 30, ftm: 24 } },
      { season: 2026, team_id: "8", team_name: "Beta", player_name: "One", games: 5, stats: { pts: 60, o_poss: 100, ast: 15, tov: 10, fga: 50, tpa: 20, tpm: 8, fta: 15, ftm: 12 } },
    ]);
    expect(result).toMatchObject({ points: 180, possessions: 300, assists: 45, turnovers: 30, fieldGoalAttempts: 150, threesAttempted: 60, freeThrowsAttempted: 45 });
    expect(result.rates).toEqual({ pointsPerPossession: .6, threePointAttemptRate: .4, freeThrowAttemptRate: .3, assistRate: .15, turnoverRate: .1 });
  });

  it("keeps possession rates unavailable when any stint lacks the denominator", () => {
    const result = comparisonPossessionContext([
      { season: 2026, team_id: "7", team_name: "Alpha", player_name: "One", games: 10, stats: { pts: 120, o_poss: 200, ast: 30, tov: 20, fga: 100, tpa: 40, fta: 30 } },
      { season: 2026, team_id: "8", team_name: "Beta", player_name: "One", games: 5, stats: { pts: 60, o_poss: null, ast: 15, tov: 10, fga: 50, tpa: 20, fta: 15 } },
    ]);
    expect(result.possessions).toBeNull();
    expect(result.rates.pointsPerPossession).toBeNull();
    expect(result.rates.assistRate).toBeNull();
    expect(result.rates.turnoverRate).toBeNull();
    expect(result.rates.threePointAttemptRate).toBe(.4);
  });
});
