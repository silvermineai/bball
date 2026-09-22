import { describe, expect, it } from "vitest";
import { gameMarketReadinessExport, gameMarketReadinessLabel } from "./game-market-readiness";
import type { LedgerGame } from "./research-types";

type Readiness = NonNullable<LedgerGame["market_readiness"]>;

const readiness = (overrides: Partial<Readiness> = {}): Readiness => ({
  status: "no_qualified_line",
  message: "ignored client-side",
  retained_observations: 0,
  eligible_observations: 0,
  comparable_observations: 0,
  selected_comparisons: 0,
  rejection_counts: {},
  ...overrides,
});

describe("game market readiness display", () => {
  it("keeps an absent line distinct from a zero model-to-market gap", () => {
    expect(gameMarketReadinessLabel(readiness())).toBe("No retained pregame line");
    expect(gameMarketReadinessExport(readiness())).toEqual([
      "no_qualified_line", "No retained pregame line", "0", "0", "0", "0",
    ]);
  });

  it("reports withheld retained quotes by the failed evidence stage", () => {
    expect(gameMarketReadinessLabel(readiness({ retained_observations: 2 })))
      .toBe("Retained line failed identity or timing checks");
    expect(gameMarketReadinessLabel(readiness({ retained_observations: 2, eligible_observations: 1 })))
      .toBe("Retained line lacks comparable model values");
    expect(gameMarketReadinessLabel(readiness({ retained_observations: 2, eligible_observations: 2, comparable_observations: 1 })))
      .toBe("No qualified pregame line");
  });

  it("keeps qualified and excluded forecast states explicit", () => {
    expect(gameMarketReadinessLabel(readiness({ status: "available", selected_comparisons: 2 })))
      .toBe("2 qualified pregame quotes");
    expect(gameMarketReadinessLabel(readiness({ status: "forecast_excluded" })))
      .toBe("Forecast excluded from market comparison");
  });
});
