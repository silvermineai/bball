import { describe, expect, it } from "vitest";
import { compareForecastEditions, compareForecastEditionsWithIdentity, forecastEditionRelation, hasForecastDelta } from "./live-forecast-delta";

describe("live forecast edition deltas", () => {
  it("reports margin, probability and total changes in their reader-facing units", () => {
    const delta = compareForecastEditions(
      { home_margin: 4.5, home_win_probability: 0.58, total: 141.2 },
      { home_margin: 6.25, home_win_probability: 0.615, total: 139.7 },
    );
    expect(delta).toEqual({ homeMargin: 1.75, homeWinProbabilityPp: 3.5, total: -1.5 });
    expect(hasForecastDelta(delta)).toBe(true);
  });

  it("withholds only malformed fields while preserving valid comparisons", () => {
    const delta = compareForecastEditions(
      { home_margin: 4, home_win_probability: 1.2, total: 140 },
      { home_margin: 5, home_win_probability: 0.6, total: Number.NaN },
    );
    expect(delta).toEqual({ homeMargin: 1, homeWinProbabilityPp: null, total: null });
  });

  it("returns no change when one edition is missing", () => {
    const delta = compareForecastEditions(null, { home_margin: 5, home_win_probability: 0.6, total: 140 });
    expect(delta).toEqual({ homeMargin: null, homeWinProbabilityPp: null, total: null });
    expect(hasForecastDelta(delta)).toBe(false);
  });

  it("classifies edition identity and withholds deltas without both IDs", () => {
    expect(forecastEditionRelation("model-a", "model-a")).toBe("same");
    expect(forecastEditionRelation("model-a", "model-b")).toBe("different");
    expect(forecastEditionRelation("model-a", undefined)).toBe("unavailable");
    expect(compareForecastEditionsWithIdentity(
      "model-a",
      undefined,
      { home_margin: 4, home_win_probability: 0.6, total: 140 },
      { home_margin: 5, home_win_probability: 0.7, total: 145 },
    )).toEqual({ homeMargin: null, homeWinProbabilityPp: null, total: null });
    expect(compareForecastEditionsWithIdentity(
      "model-a",
      "model-b",
      { home_margin: 4, home_win_probability: 0.6, total: 140 },
      { home_margin: 5, home_win_probability: 0.7, total: 145 },
    )).toEqual({ homeMargin: 1, homeWinProbabilityPp: 10, total: 5 });
  });
});
