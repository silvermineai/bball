import { describe, expect, it } from "vitest";
import { comparisonGapDirection, comparisonGapLabel } from "./market-display";
import type { Comparison } from "./research-types";

const comparison = (market: Comparison["market"], model_difference: number): Comparison => ({
  provider: "test",
  bookmaker: "test book",
  market,
  captured_at: "2026-09-10T12:00:00Z",
  updated_at: "2026-09-10T11:00:00Z",
  line: null,
  model_difference,
  market_home_probability: null,
});

describe("market comparison display", () => {
  it("keeps spread and total gaps in points with their market meaning", () => {
    expect(comparisonGapLabel(comparison("spreads", 2.35))).toBe("+2.4 pts model home margin");
    expect(comparisonGapLabel(comparison("totals", -1.25))).toBe("-1.3 pts model total");
    expect(comparisonGapDirection(comparison("spreads", 2.35))).toBe("home");
    expect(comparisonGapDirection(comparison("totals", -1.25))).toBe("under");
  });

  it("labels moneyline gaps as probability points", () => {
    expect(comparisonGapLabel(comparison("h2h", 0.043))).toBe("+4.3 probability pts");
    expect(comparisonGapDirection(comparison("h2h", -0.043))).toBe("away");
  });

  it("does not invent a gap for non-finite values", () => {
    const missing = comparison("spreads", Number.NaN);
    expect(comparisonGapLabel(missing)).toBeNull();
    expect(comparisonGapDirection(missing)).toBe("neutral");
  });
});
