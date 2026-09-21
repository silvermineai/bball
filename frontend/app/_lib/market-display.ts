import type { Comparison } from "./research-types";

export type MarketLineSummary = {
  spread: number | null;
  total: number | null;
  spreadGap: number | null;
  totalGap: number | null;
  homeProbability: number | null;
  winProbabilityGap: number | null;
  capturedAt: string | null;
};

/**
 * Pick one qualifying spread and total for compact forecast tables.
 * Provider identity stays in the deep evidence view; the landing board only
 * needs the observed line, model difference and capture clock.
 */
export function summarizeMarketLines(comparisons: Comparison[]): MarketLineSummary {
  const valid = comparisons
    .filter((comparison) => comparison.market === "spreads" || comparison.market === "totals")
    .filter((comparison) => comparison.line != null && Number.isFinite(comparison.line))
    .filter((comparison) => Number.isFinite(comparison.model_difference))
    .filter((comparison) => comparison.market !== "totals" || (comparison.line as number) >= 0);
  const timestamp = (comparison: Comparison) => comparison.updated_at || comparison.captured_at || "";
  const newest = (market: Comparison["market"]) => valid
    .filter((comparison) => comparison.market === market)
    .sort((left, right) => timestamp(right).localeCompare(timestamp(left)))[0] || null;
  const moneyline = comparisons
    .filter((comparison) => comparison.market === "h2h")
    .filter((comparison) => comparison.market_home_probability != null
      && Number.isFinite(comparison.market_home_probability)
      && comparison.market_home_probability >= 0
      && comparison.market_home_probability <= 1)
    .filter((comparison) => Number.isFinite(comparison.model_difference))
    .sort((left, right) => timestamp(right).localeCompare(timestamp(left)))[0] || null;
  const spread = newest("spreads");
  const total = newest("totals");
  const timestamps = comparisons
    .filter((comparison) => {
      if (comparison.market === "h2h") {
        return comparison.market_home_probability != null
          && Number.isFinite(comparison.market_home_probability)
          && comparison.market_home_probability >= 0
          && comparison.market_home_probability <= 1
          && Number.isFinite(comparison.model_difference);
      }
      return valid.includes(comparison);
    })
    .map((comparison) => comparison.updated_at || comparison.captured_at)
    .filter(Boolean)
    .sort();
  return {
    spread: spread?.line ?? null,
    total: total?.line ?? null,
    spreadGap: spread && Number.isFinite(spread.model_difference) ? spread.model_difference : null,
    totalGap: total && Number.isFinite(total.model_difference) ? total.model_difference : null,
    homeProbability: moneyline?.market_home_probability ?? null,
    winProbabilityGap: moneyline?.model_difference ?? null,
    capturedAt: timestamps.at(-1) || null,
  };
}

export function hasQualifiedMarketComparison(summary: MarketLineSummary): boolean {
  return summary.spread != null || summary.total != null || summary.homeProbability != null;
}

/**
 * Turn the scorecard's signed model difference into a reader-facing label.
 * The scorecard stores one common signed value, but its unit depends on the
 * market: points for spreads/totals and probability points for moneylines.
 */
export function comparisonGapLabel(comparison: Comparison): string | null {
  if (!Number.isFinite(comparison.model_difference)) return null;
  const rawValue = comparison.market === "h2h"
    ? comparison.model_difference * 100
    : comparison.model_difference;
  const sign = rawValue > 0 ? "+" : "";
  const value = `${sign}${rawValue.toFixed(1)}`;
  if (comparison.market === "h2h") return `${value} probability pts`;
  if (comparison.market === "totals") return `${value} pts model total`;
  return `${value} pts model home margin`;
}

/**
 * Describe which side the model is above or below the observed quote. This is
 * intentionally descriptive language; it does not call a wager or edge.
 */
export function comparisonGapDirection(comparison: Comparison): "home" | "away" | "over" | "under" | "neutral" {
  if (!Number.isFinite(comparison.model_difference) || comparison.model_difference === 0) return "neutral";
  if (comparison.market === "totals") return comparison.model_difference > 0 ? "over" : "under";
  return comparison.model_difference > 0 ? "home" : "away";
}

/** Translate the signed gap into the market-specific comparison a reader needs. */
export function comparisonGapDirectionLabel(comparison: Comparison): string | null {
  const direction = comparisonGapDirection(comparison);
  switch (direction) {
    case "home":
      return comparison.market === "h2h"
        ? "Model home win probability is above the no-vig market probability"
        : "Model home margin is above the quoted line";
    case "away":
      return comparison.market === "h2h"
        ? "Model home win probability is below the no-vig market probability"
        : "Model home margin is below the quoted line";
    case "over":
      return "Model total is above the quoted total";
    case "under":
      return "Model total is below the quoted total";
    case "neutral":
      return Number.isFinite(comparison.model_difference) ? "Model matches the quoted value" : null;
  }
}

/** Compact, CSV-safe summary used when a matchup has more than one quote. */
export function comparisonQuoteSummary(comparison: Comparison): string {
  const line = comparison.market === "h2h"
    ? comparison.market_home_probability == null
      ? "moneyline"
      : `${(comparison.market_home_probability * 100).toFixed(1)}% home`
    : comparison.line == null
      ? "line unavailable"
      : comparison.market === "totals"
        ? `O/U ${comparison.line.toFixed(1)}`
        : `home ${comparison.line > 0 ? "+" : ""}${comparison.line.toFixed(1)}`;
  const gap = comparisonGapLabel(comparison);
  return `Verified line ${comparison.market} ${line}${gap ? ` · model ${gap}` : ""} · captured ${comparison.captured_at}`;
}
