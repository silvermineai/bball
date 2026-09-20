import { describe, expect, it } from "vitest";
import { footballDivisionAvailability, lowerFootballDivision } from "./football-division-scope";

describe("football division publication boundary", () => {
  it("exposes only men's D2 and D3 as lower-division schedule scopes", () => {
    expect(lowerFootballDivision("football", { gender: "men", division: "2" })).toBe("2");
    expect(lowerFootballDivision("football", { gender: "men", division: "3" })).toBe("3");
    expect(lowerFootballDivision("football", { gender: "men", division: "1" })).toBeNull();
    expect(lowerFootballDivision("football", { gender: "women", division: "2" })).toBeNull();
    expect(lowerFootballDivision("basketball", { gender: "men", division: "2" })).toBeNull();
  });

  it("keeps unsupported football fields unavailable", () => {
    expect(footballDivisionAvailability("2")).toEqual({
      division: "2",
      scheduleRows: true,
      playerStats: false,
      teamStats: false,
      rankings: false,
      predictions: false,
    });
  });
});
