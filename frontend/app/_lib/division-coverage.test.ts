import { describe, expect, it } from "vitest";
import { divisionCoverage } from "./division-coverage";

const states = (sport: "basketball" | "football", gender: "men" | "women", division: "2" | "3") =>
  Object.fromEntries(divisionCoverage(sport, gender, division).map((row) => [row.surface, row.state]));

describe("division coverage matrix", () => {
  it("keeps men’s basketball lower archives separate from unsupported surfaces", () => {
    expect(states("basketball", "men", "2")).toEqual({
      players: "recorded",
      teams: "recorded",
      matches: "recorded",
      rankings: "recorded",
      predictions: "unavailable",
      recruiting: "unavailable",
    });
  });

  it("records lower-division football schedule and completed result rows", () => {
    const rows = divisionCoverage("football", "men", "3");
    expect(states("football", "men", "3")).toEqual({
      players: "partial",
      teams: "recorded",
      matches: "recorded",
      rankings: "recorded",
      predictions: "recorded",
      recruiting: "unavailable",
    });
    expect(rows.find((row) => row.surface === "matches")?.note).toContain("completed score results");
    expect(rows.find((row) => row.surface === "players")?.note).toContain("Observed exact-ID");
  });

  it("does not substitute men’s rows into women’s lower divisions", () => {
    expect(Object.values(states("basketball", "women", "2"))).toEqual([
      "unavailable", "unavailable", "unavailable", "unavailable", "unavailable", "unavailable",
    ]);
  });

  it("labels the women’s lower player boundary without hiding source-native leaderboards", () => {
    const row = divisionCoverage("basketball", "women", "2").find((item) => item.surface === "players");
    expect(row?.state).toBe("unavailable");
    expect(row?.note).toContain("Source-native leaderboard rows are displayed separately");
  });
});
