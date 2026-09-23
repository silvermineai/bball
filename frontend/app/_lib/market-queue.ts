import type { LedgerGame } from "./research-types";

export type MarketQueueBucket = "qualified" | "needs_capture" | "withheld" | "unavailable" | "excluded";

export type MarketQueueFilter = "all" | MarketQueueBucket;

export type MarketQueueSummary = {
  upcoming: number;
  qualified: number;
  needs_capture: number;
  withheld: number;
  unavailable: number;
  excluded: number;
};

const UPCOMING_STATUSES = new Set(["scheduled", "awaiting_result"]);

/**
 * Classify the market state of an upcoming forecast without turning a missing
 * quote into a model edge. The scorecard API's readiness counters are the
 * evidence source; an absent readiness object remains explicitly unavailable.
 */
export function marketQueueBucket(game: Pick<LedgerGame, "status" | "comparisons" | "market_readiness">): MarketQueueBucket | null {
  if (!UPCOMING_STATUSES.has(game.status)) return null;
  const readiness = game.market_readiness;
  if (readiness?.status === "forecast_excluded") return "excluded";
  if (game.comparisons.length > 0 || (readiness?.selected_comparisons || 0) > 0 || readiness?.status === "available") {
    return "qualified";
  }
  if (!readiness) return "unavailable";
  if ((readiness.retained_observations || 0) > 0) return "withheld";
  return "needs_capture";
}

/** Summarize the upcoming model slate by market evidence state. */
export function summarizeMarketQueue(games: readonly Pick<LedgerGame, "status" | "comparisons" | "market_readiness">[]): MarketQueueSummary {
  const summary: MarketQueueSummary = {
    upcoming: 0,
    qualified: 0,
    needs_capture: 0,
    withheld: 0,
    unavailable: 0,
    excluded: 0,
  };
  games.forEach((game) => {
    const bucket = marketQueueBucket(game);
    if (!bucket) return;
    summary.upcoming += 1;
    summary[bucket] += 1;
  });
  return summary;
}

/** Apply a market queue filter while preserving settled rows for the default view. */
export function matchesMarketQueueFilter(
  game: Pick<LedgerGame, "status" | "comparisons" | "market_readiness">,
  filter: MarketQueueFilter,
): boolean {
  if (filter === "all") return true;
  return marketQueueBucket(game) === filter;
}
