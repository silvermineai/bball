import { describe, expect, it } from "vitest";
import { currentCategoryLeaders, currentScoringLeaders, divisionCoverage, playersForDivision, type IndividualPlayer } from "./NcaaCurrentLeaders";

const player = (id: number, division: number, name: string, ppg: number): IndividualPlayer => ({
  player_id: id,
  division,
  name,
  games: 20,
  ppg,
  rpg: 4,
  apg: 3,
  fga: 100,
  fta: 20,
  pts: ppg * 20,
  fg_pct: 50,
});

describe("NCAA current leader cohorts", () => {
  it("keeps published divisions in separate cohorts", () => {
    const rows = [player(1, 1, "D1 leader", 20), player(2, 2, "D2 leader", 30), player(3, 3, "D3 leader", 25)];
    expect(playersForDivision(rows, "2").map((row) => row.name)).toEqual(["D2 leader"]);
    expect(currentScoringLeaders(rows, "2").map((row) => row.name)).toEqual(["D2 leader"]);
    expect(currentScoringLeaders(rows, "2")[0]?.ppg).toBe(30);
  });

  it("applies category sample minimums inside the selected division", () => {
    const rows = [
      { ...player(1, 1, "D1 high", 20), fga: 74 },
      { ...player(2, 2, "D2 qualified", 12), fga: 80 },
      { ...player(3, 2, "D2 low", 18), fga: 20 },
    ];
    const leaders = currentCategoryLeaders(rows, "2");
    expect(leaders.find((entry) => entry.field === "fg_pct")?.player.name).toBe("D2 qualified");
  });

  it("reports selected-division field coverage without turning missing values into zero", () => {
    const rows = [
      player(1, 2, "Recorded", 20),
      { ...player(2, 2, "Sparse", 15), apg: null, fg_pct: null },
      player(3, 1, "Other division", 30),
    ];
    const coverage = divisionCoverage(rows, "2");
    expect(coverage.records).toBe(2);
    expect(coverage.fields.ppg).toEqual({ observed: 2, total: 2, share: 1 });
    expect(coverage.fields.apg).toEqual({ observed: 1, total: 2, share: 0.5 });
    expect(coverage.fields.fg_pct).toEqual({ observed: 1, total: 2, share: 0.5 });
  });
});
