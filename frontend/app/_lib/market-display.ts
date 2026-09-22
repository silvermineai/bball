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

function validClock(value: string | null | undefined): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/**
 * Compact forecast boards may receive bundled or legacy rows in addition to
 * the live scorecard. Require both retained clocks before showing a line or
 * model difference so a malformed row cannot look like current market
 * evidence. The archive still keeps that row available for audit.
 */
function hasCompleteMarketClocks(comparison: Pick<Comparison, "captured_at" | "updated_at">): boolean {
  return validClock(comparison.captured_at) && validClock(comparison.updated_at);
}

/**
 * Put a qualifying quote's update clock in context beside the scheduled tip.
 * The scorecard already applies the server timing gates; this display keeps
 * the remaining freshness evidence reviewable without calling a quote a
 * closing line or inferring a price when a clock is missing.
 */
export function comparisonTimingLabel(comparison: Pick<Comparison, "updated_at">, startsAt: string): string {
  const tip = Date.parse(startsAt);
  const updated = Date.parse(comparison.updated_at);
  if (!Number.isFinite(tip) || !Number.isFinite(updated)) return "Timing unavailable";
  if (updated >= tip) return "Post-tip update";
  const hours = (tip - updated) / 3_600_000;
  if (hours < 1) return "Updated less than 1h before tip";
  if (hours < 24) return `Updated ${Number.isInteger(hours) ? hours : hours.toFixed(1)}h before tip`;
  return `Updated ${Math.round(hours)}h before tip`;
}

/**
 * Pick one qualifying spread and total for compact forecast tables.
 * Provider identity stays in the deep evidence view; the landing board only
 * needs the observed line, model difference and capture clock.
 */
export function summarizeMarketLines(comparisons: Comparison[]): MarketLineSummary {
  const valid = comparisons
    .filter((comparison) => comparison.market === "spreads" || comparison.market === "totals")
    .filter(hasCompleteMarketClocks)
    .filter((comparison) => comparison.line != null && Number.isFinite(comparison.line))
    .filter((comparison) => Number.isFinite(comparison.model_difference))
    .filter((comparison) => comparison.market !== "totals" || (comparison.line as number) >= 0);
  const timestamp = (comparison: Comparison) => comparison.updated_at || comparison.captured_at || "";
  const newest = (market: Comparison["market"]) => valid
    .filter((comparison) => comparison.market === market)
    .sort((left, right) => timestamp(right).localeCompare(timestamp(left)))[0] || null;
  const moneyline = comparisons
    .filter((comparison) => comparison.market === "h2h")
    .filter(hasCompleteMarketClocks)
    .filter((comparison) => comparison.market_home_probability != null
      && Number.isFinite(comparison.market_home_probability)
      && comparison.market_home_probability >= 0
      && comparison.market_home_probability <= 1)
    .filter((comparison) => Number.isFinite(comparison.model_difference))
    .sort((left, right) => timestamp(right).localeCompare(timestamp(left)))[0] || null;
  const spread = newest("spreads");
  const total = newest("totals");
  const timestamps = comparisons
    .filter(hasCompleteMarketClocks)
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

/**
 * Keep the compact forecast board honest about when its selected quote was
 * updated relative to tip. A displayed gap without its timing context can be
 * mistaken for a current or closing line, even though the scorecard only
 * treats the retained clock as evidence.
 */
export function marketTimingLabel(comparisons: Comparison[], startsAt: string): string | null {
  const valid = comparisons
    .filter(hasCompleteMarketClocks)
    .filter((comparison) => comparison.market === "spreads" || comparison.market === "totals"
      ? comparison.line != null
        && Number.isFinite(comparison.line)
        && Number.isFinite(comparison.model_difference)
        && (comparison.market !== "totals" || comparison.line >= 0)
      : comparison.market_home_probability != null
        && Number.isFinite(comparison.market_home_probability)
        && comparison.market_home_probability >= 0
        && comparison.market_home_probability <= 1
        && Number.isFinite(comparison.model_difference))
    .sort((left, right) => (right.updated_at || right.captured_at).localeCompare(left.updated_at || left.captured_at));
  return valid[0] ? comparisonTimingLabel(valid[0], startsAt) : null;
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
  return `Verified line ${comparison.market} ${line}${gap ? ` · model ${gap}` : ""} · captured ${comparison.captured_at} · updated ${comparison.updated_at}`;
}
