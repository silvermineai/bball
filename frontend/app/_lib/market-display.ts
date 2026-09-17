import type { Comparison } from "./research-types";

export type MarketLineSummary = {
  spread: number | null;
  total: number | null;
  spreadGap: number | null;
  totalGap: number | null;
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
    .filter((comparison) => comparison.line != null && Number.isFinite(comparison.line));
  const spread = valid.find((comparison) => comparison.market === "spreads") || null;
  const total = valid.find((comparison) => comparison.market === "totals") || null;
  const timestamps = valid
    .map((comparison) => comparison.updated_at || comparison.captured_at)
    .filter(Boolean)
    .sort();
  return {
    spread: spread?.line ?? null,
    total: total?.line ?? null,
    spreadGap: spread && Number.isFinite(spread.model_difference) ? spread.model_difference : null,
    totalGap: total && Number.isFinite(total.model_difference) ? total.model_difference : null,
    capturedAt: timestamps.at(-1) || null,
  };
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
  return `${comparison.bookmaker} ${comparison.market} ${line}${gap ? ` · model ${gap}` : ""} · captured ${comparison.captured_at}`;
}
