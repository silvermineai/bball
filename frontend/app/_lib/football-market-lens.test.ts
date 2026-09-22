import { describe, expect, it } from "vitest";
import { footballMarketComparison } from "./football-market-lens";

describe("football market comparison", () => {
  it("converts a home spread into the comparable home margin", () => {
    const result = footballMarketComparison({
      homeName: "Home State",
      homeMargin: 5,
      homeSpread: -3,
    });
    expect(result).toMatchObject({
      status: "comparable",
      marketHomeMargin: 3,
      difference: 2,
    });
    expect(result.text).toContain("2.0 points more favorable to Home State");
    expect(result.text).toContain("not a betting return");
  });

  it("keeps missing and invalid spreads unavailable", () => {
    expect(footballMarketComparison({ homeName: "Home", homeMargin: 5, homeSpread: null })).toMatchObject({
      status: "unavailable",
      marketHomeMargin: null,
      difference: null,
    });
    expect(footballMarketComparison({ homeName: "Home", homeMargin: Number.NaN, homeSpread: -3 }).text)
      .toContain("margin disagreement is unavailable");
  });

  it("describes a close match without manufacturing an edge", () => {
    const result = footballMarketComparison({ homeName: "Home", homeMargin: 3.02, homeSpread: -3 });
    expect(result.difference).toBeCloseTo(0.02);
    expect(result.text).toContain("matches the spread-implied margin");
    expect(result.text).not.toContain("favorable to");
  });
});
