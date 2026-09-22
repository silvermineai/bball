import { describe, expect, it } from "vitest";
import { boutiqueComparisonSeasonMatches } from "./boutique-comparison";

describe("boutique comparison season boundary", () => {
  it("allows exact completed-season comparisons", () => {
    expect(boutiqueComparisonSeasonMatches("2026", 2026)).toBe(true);
    expect(boutiqueComparisonSeasonMatches(2026, 2026)).toBe(true);
  });

  it("withholds comparisons for a different or malformed season", () => {
    expect(boutiqueComparisonSeasonMatches("2025", 2026)).toBe(false);
    expect(boutiqueComparisonSeasonMatches("2026.5", 2026)).toBe(false);
    expect(boutiqueComparisonSeasonMatches("not-a-season", 2026)).toBe(false);
    expect(boutiqueComparisonSeasonMatches("2026", 0)).toBe(false);
  });
});
