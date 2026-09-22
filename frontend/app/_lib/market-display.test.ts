import { describe, expect, it } from "vitest";
import { comparisonGapDirection, comparisonGapDirectionLabel, comparisonGapLabel, comparisonQuoteSummary, comparisonTimingLabel, hasQualifiedMarketComparison, marketTimingLabel, summarizeMarketLines } from "./market-display";
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
    expect(comparisonGapDirectionLabel(comparison("spreads", 2.35))).toContain("above the quoted line");
    expect(comparisonGapDirectionLabel(comparison("totals", -1.25))).toContain("below the quoted total");
  });

  it("labels moneyline gaps as probability points", () => {
    expect(comparisonGapLabel(comparison("h2h", 0.043))).toBe("+4.3 probability pts");
    expect(comparisonGapDirection(comparison("h2h", -0.043))).toBe("away");
    expect(comparisonGapDirectionLabel(comparison("h2h", -0.043))).toContain("below the no-vig market probability");
  });

  it("does not invent a gap for non-finite values", () => {
    const missing = comparison("spreads", Number.NaN);
    expect(comparisonGapLabel(missing)).toBeNull();
    expect(comparisonGapDirection(missing)).toBe("neutral");
    expect(comparisonGapDirectionLabel(missing)).toBeNull();
  });

  it("keeps a compact quote summary useful in exports", () => {
    const quote = { ...comparison("h2h", 0.043), market_home_probability: 0.512, line: null };
    expect(comparisonQuoteSummary(quote)).toBe("Verified line h2h 51.2% home · model +4.3 probability pts · captured 2026-09-10T12:00:00Z · updated 2026-09-10T11:00:00Z");
  });

  it("makes the quote update clock readable relative to tip", () => {
    expect(comparisonTimingLabel({ updated_at: "2026-09-12T14:00:00Z" }, "2026-09-12T16:00:00Z")).toBe("Updated 2h before tip");
    expect(comparisonTimingLabel({ updated_at: "2026-09-12T12:00:00Z" }, "2026-09-12T12:30:00Z")).toBe("Updated less than 1h before tip");
    expect(comparisonTimingLabel({ updated_at: "2026-09-12T10:00:00Z" }, "2026-09-12T11:00:00Z")).toBe("Updated 1h before tip");
    expect(comparisonTimingLabel({ updated_at: "not-a-clock" }, "2026-09-12T16:00:00Z")).toBe("Timing unavailable");
  });

  it("summarizes only observed spread and total lines", () => {
    const staleSpread = { ...comparison("spreads", 11.1), line: 4.5, updated_at: "2026-09-12T15:30:00Z" };
    const spread = { ...comparison("spreads", 12.64), line: 5.5, updated_at: "2026-09-12T15:32:51Z" };
    const total = { ...comparison("totals", 5.85), line: 43.5, updated_at: "2026-09-12T15:32:52Z" };
    const summary = summarizeMarketLines([staleSpread, spread, total, { ...comparison("h2h", 0.04), market_home_probability: 0.5 }]);
    expect(summary).toEqual({ spread: 5.5, total: 43.5, spreadGap: 12.64, totalGap: 5.85, homeProbability: 0.5, winProbabilityGap: 0.04, capturedAt: "2026-09-12T15:32:52Z" });
    expect(hasQualifiedMarketComparison(summary)).toBe(true);
    const empty = summarizeMarketLines([]);
    expect(empty).toEqual({ spread: null, total: null, spreadGap: null, totalGap: null, homeProbability: null, winProbabilityGap: null, capturedAt: null });
    expect(hasQualifiedMarketComparison(empty)).toBe(false);
  });

  it("keeps the compact board's selected quote timing beside the line", () => {
    const quote = { ...comparison("spreads", 2.5), line: 4.5, updated_at: "2026-09-12T14:00:00Z" };
    expect(marketTimingLabel([quote], "2026-09-12T16:00:00Z")).toBe("Updated 2h before tip");
    expect(marketTimingLabel([{ ...quote, updated_at: "2026-09-12T16:01:00Z" }], "2026-09-12T16:00:00Z")).toBe("Post-tip update");
    expect(marketTimingLabel([{ ...quote, line: null }], "2026-09-12T16:00:00Z")).toBeNull();
  });

  it("retains a moneyline-only comparison for compact boards", () => {
    const summary = summarizeMarketLines([{ ...comparison("h2h", 0.043), market_home_probability: 0.512, updated_at: "2026-09-12T15:35:00Z" }]);
    expect(summary).toMatchObject({ spread: null, total: null, homeProbability: 0.512, winProbabilityGap: 0.043, capturedAt: "2026-09-12T15:35:00Z" });
    expect(hasQualifiedMarketComparison(summary)).toBe(true);
  });

  it("withholds impossible market totals and probabilities", () => {
    const summary = summarizeMarketLines([
      { ...comparison("totals", 4), line: -2 },
      { ...comparison("h2h", 0.2), market_home_probability: 1.2 },
    ]);
    expect(summary).toEqual({ spread: null, total: null, spreadGap: null, totalGap: null, homeProbability: null, winProbabilityGap: null, capturedAt: null });
  });

  it("does not count a line without a finite model gap as a comparison", () => {
    const summary = summarizeMarketLines([
      { ...comparison("spreads", Number.NaN), line: 3.5 },
      { ...comparison("totals", Number.POSITIVE_INFINITY), line: 145.5 },
    ]);
    expect(summary).toEqual({ spread: null, total: null, spreadGap: null, totalGap: null, homeProbability: null, winProbabilityGap: null, capturedAt: null });
    expect(hasQualifiedMarketComparison(summary)).toBe(false);
  });

  it("withholds a compact-board line when both market clocks are invalid", () => {
    const summary = summarizeMarketLines([
      { ...comparison("spreads", 2.5), line: 4.5, captured_at: "not-a-clock", updated_at: "also-not-a-clock" },
      { ...comparison("h2h", 0.04), market_home_probability: 0.52, captured_at: "not-a-clock", updated_at: "also-not-a-clock" },
    ]);
    expect(summary).toEqual({ spread: null, total: null, spreadGap: null, totalGap: null, homeProbability: null, winProbabilityGap: null, capturedAt: null });
    expect(hasQualifiedMarketComparison(summary)).toBe(false);
    expect(marketTimingLabel([
      { ...comparison("spreads", 2.5), line: 4.5, captured_at: "not-a-clock", updated_at: "also-not-a-clock" },
    ], "2026-09-12T16:00:00Z")).toBeNull();
  });
});
