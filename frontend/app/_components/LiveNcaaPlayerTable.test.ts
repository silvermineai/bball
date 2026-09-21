import { describe, expect, it } from "vitest";
import { effectiveFieldGoalPercent, playerCoreStatCoverage, playerCsvHeaders, playerCsvRows, validatePlayerExportPage, type LiveNCAAPlayerRow } from "./LiveNcaaPlayerTable";

const row: LiveNCAAPlayerRow = {
  player_id: "p-1",
  player_name: "A Player",
  team_name: "A University",
  position: "G",
  class_year: "JR",
  games: 20,
  minutes: 600,
  points: 300,
  rebounds: 100,
  offensive_rebounds: 20,
  defensive_rebounds: 80,
  assists: 60,
  steals: 20,
  blocks: 5,
  double_doubles: 3,
  fouls: 40,
  turnovers: 30,
  fga: 200,
  fgm: 100,
  tpa: 80,
  tpm: 32,
  fta: 50,
  ftm: 40,
  value: 15,
  rank: 4,
};

describe("homepage NCAA player export", () => {
  it("keeps raw counting totals, denominators, rates, and the selected metric together", () => {
    const values = playerCsvRows([row], "ppg")[0];
    expect(playerCsvHeaders.slice(0, 9)).toEqual(["Rank", "Player ID", "Player", "Team", "Position", "Class", "GP", "Minutes", "MPG"]);
    expect(values.slice(0, 9)).toEqual([4, "p-1", "A Player", "A University", "G", "JR", 20, 600, 30]);
    expect(values[playerCsvHeaders.indexOf("PPG")]).toBe(15);
    expect(values[playerCsvHeaders.indexOf("eFG%")]).toBe(58);
    expect(values[playerCsvHeaders.indexOf("3P%")]).toBe(40);
    expect(values[playerCsvHeaders.indexOf("FT%")]).toBe(80);
    expect(values[playerCsvHeaders.indexOf("Selected metric")]).toBe("ppg");
    expect(values[playerCsvHeaders.indexOf("Selected value")]).toBe(15);
    expect(values[playerCsvHeaders.indexOf("Core stat fields recorded")]).toBe("16/16");
  });

  it("preserves unavailable values instead of converting them to zero", () => {
    const sparse = { ...row, fta: null, ftm: null, tpa: null, tpm: null };
    const values = playerCsvRows([sparse], "ft_pct")[0];
    expect(values[playerCsvHeaders.indexOf("3P%")]).toBeNull();
    expect(values[playerCsvHeaders.indexOf("FT%")]).toBeNull();
    expect(values[playerCsvHeaders.indexOf("TS%")]).toBeNull();
  });

  it("keeps eFG unavailable when either field-goal make total is missing", () => {
    expect(effectiveFieldGoalPercent(null, 32, 200)).toBeNull();
    expect(effectiveFieldGoalPercent(100, null, 200)).toBeNull();
    expect(effectiveFieldGoalPercent(100, 32, null)).toBeNull();
    expect(effectiveFieldGoalPercent(100, 32, 200)).toBe(58);
    const values = playerCsvRows([{ ...row, fgm: null }], "efg")[0];
    expect(values[playerCsvHeaders.indexOf("eFG%")]).toBeNull();
  });

  it("reports partial source coverage without converting unavailable fields to zero", () => {
    const sparse = { ...row, fta: null, ftm: null, tpa: null, tpm: null, fouls: null };
    expect(playerCoreStatCoverage(sparse)).toEqual({ observed: 11, total: 16 });
    expect(playerCsvRows([sparse], "ft_pct")[0][playerCsvHeaders.indexOf("Core stat fields recorded")]).toBe("11/16");
  });

  it("requires stable pagination metadata and non-empty intermediate pages", () => {
    const page = { total: 2, page_size: 1, rows: [row] };
    expect(validatePlayerExportPage(page, 2, 1, 0, 2)).toEqual([row]);
    expect(() => validatePlayerExportPage({ ...page, total: 3 }, 2, 1, 1, 2)).toThrow("changed during export");
    expect(() => validatePlayerExportPage({ ...page, rows: [] }, 2, 1, 0, 2)).toThrow("incomplete page");
  });

  it("accepts a short final page without accepting an incomplete cohort", () => {
    const page = { total: 2, page_size: 2, rows: [row] };
    expect(validatePlayerExportPage(page, 2, 2, 0, 1)).toEqual([row]);
    expect(() => validatePlayerExportPage({ ...page, rows: [] }, 2, 2, 0, 1)).not.toThrow();
  });
});
