import { describe, expect, it } from "vitest";
import { divisionCoverage } from "./division-coverage";

const states = (sport: "basketball" | "football", gender: "men" | "women", division: "2" | "3") =>
  Object.fromEntries(divisionCoverage(sport, gender, division).map((row) => [row.surface, row.state]));

describe("division coverage matrix", () => {
  it("keeps men’s basketball lower archives separate from unsupported surfaces", () => {
    expect(states("basketball", "men", "2")).toEqual({
      players: "recorded",
      teams: "recorded",
      matches: "unavailable",
      rankings: "recorded",
      predictions: "unavailable",
      recruiting: "unavailable",
    });
  });

  it("records lower-division football schedule and completed result rows", () => {
    const rows = divisionCoverage("football", "men", "3");
    expect(states("football", "men", "3")).toEqual({
      players: "unavailable",
      teams: "unavailable",
      matches: "recorded",
      rankings: "unavailable",
      predictions: "unavailable",
      recruiting: "unavailable",
    });
    expect(rows.find((row) => row.surface === "matches")?.note).toContain("completed score results");
  });

  it("does not substitute men’s rows into women’s lower divisions", () => {
    expect(Object.values(states("basketball", "women", "2"))).toEqual([
      "unavailable", "unavailable", "unavailable", "unavailable", "unavailable", "unavailable",
    ]);
  });
});
