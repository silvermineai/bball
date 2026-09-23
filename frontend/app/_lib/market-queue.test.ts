import { describe, expect, it } from "vitest";
import { matchesMarketQueueFilter, marketQueueBucket, summarizeMarketQueue } from "./market-queue";
import type { LedgerGame } from "./research-types";

type Game = Pick<LedgerGame, "status" | "comparisons" | "market_readiness">;

const game = (overrides: Partial<Game> = {}): Game => ({
  status: "scheduled",
  comparisons: [],
  market_readiness: {
    status: "no_qualified_line",
    message: "No quote",
    retained_observations: 0,
    eligible_observations: 0,
    comparable_observations: 0,
    selected_comparisons: 0,
    rejection_counts: {},
  },
  ...overrides,
});

describe("upcoming market queue", () => {
  it("keeps missing, withheld, qualified, and unavailable evidence distinct", () => {
    expect(marketQueueBucket(game())).toBe("needs_capture");
    expect(marketQueueBucket(game({ market_readiness: { ...game().market_readiness!, retained_observations: 1 } }))).toBe("withheld");
    expect(marketQueueBucket(game({ comparisons: [{} as LedgerGame["comparisons"][number]], market_readiness: { ...game().market_readiness!, status: "available", selected_comparisons: 1 } }))).toBe("qualified");
    expect(marketQueueBucket(game({ market_readiness: undefined }))).toBe("unavailable");
  });

  it("excludes settled rows from the upcoming queue and retains forecast exclusions", () => {
    expect(marketQueueBucket(game({ status: "settled" }))).toBeNull();
    expect(marketQueueBucket(game({ market_readiness: { ...game().market_readiness!, status: "forecast_excluded" } }))).toBe("excluded");
  });

  it("summarizes only upcoming forecast rows", () => {
    const summary = summarizeMarketQueue([
      game(),
      game({ market_readiness: undefined }),
      game({ market_readiness: { ...game().market_readiness!, retained_observations: 2 } }),
      game({ comparisons: [{} as LedgerGame["comparisons"][number]], market_readiness: { ...game().market_readiness!, status: "available", selected_comparisons: 1 } }),
      game({ status: "settled" }),
    ]);
    expect(summary).toEqual({ upcoming: 4, qualified: 1, needs_capture: 1, withheld: 1, unavailable: 1, excluded: 0 });
  });

  it("filters rows by the same bucket used in the summary", () => {
    expect(matchesMarketQueueFilter(game(), "needs_capture")).toBe(true);
    expect(matchesMarketQueueFilter(game(), "qualified")).toBe(false);
    expect(matchesMarketQueueFilter(game({ status: "settled" }), "all")).toBe(true);
    expect(matchesMarketQueueFilter(game({ status: "settled" }), "needs_capture")).toBe(false);
  });
});
