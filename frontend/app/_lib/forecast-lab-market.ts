import type { Comparison } from "./research-types";

export type ForecastLabMarket = Comparison["market"];

export type ForecastLabQuoteIdentity = {
  state: "exact" | "event_only" | "observation_only" | "unavailable";
  label: "Observation + source event IDs" | "Source event ID only" | "Observation ID only" | "Market IDs unavailable";
  observationId: string | null;
  marketGameId: string | null;
};

function retainedId(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

/**
 * Keep the quote's retained identity visible beside the derived comparison.
 * An exact-game comparison may still be usable when an older archive row did
 * not retain one of these optional IDs, so this reports the evidence level
 * instead of silently upgrading a missing identifier into an exact claim.
 */
export function forecastLabQuoteIdentity(quote: Comparison): ForecastLabQuoteIdentity {
  const observationId = retainedId(quote.market_observation_id);
  const marketGameId = retainedId(quote.market_game_id);
  if (observationId && marketGameId) {
    return { state: "exact", label: "Observation + source event IDs", observationId, marketGameId };
  }
  if (marketGameId) {
    return { state: "event_only", label: "Source event ID only", observationId, marketGameId };
  }
  if (observationId) {
    return { state: "observation_only", label: "Observation ID only", observationId, marketGameId };
  }
  return { state: "unavailable", label: "Market IDs unavailable", observationId, marketGameId };
}

function clock(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function completeQuote(quote: Comparison, market: ForecastLabMarket) {
  if (quote.market !== market || !Number.isFinite(quote.model_difference)) return false;
  if (clock(quote.captured_at) === Number.NEGATIVE_INFINITY && clock(quote.updated_at) === Number.NEGATIVE_INFINITY) return false;
  if (market === "h2h") {
    return quote.market_home_probability != null
      && Number.isFinite(quote.market_home_probability)
      && quote.market_home_probability >= 0
      && quote.market_home_probability <= 1;
  }
  return quote.line != null
    && Number.isFinite(quote.line)
    && (market !== "totals" || quote.line >= 0);
}

/**
 * Return only market rows that contain the value and clock required for a
 * reader-facing comparison. Retained rows can still be present for audit,
 * but an incomplete row must not make a game's market evidence look verified.
 */
export function completeForecastLabMarketQuotes(comparisons: Comparison[]): Comparison[] {
  return comparisons.filter((quote) => completeQuote(quote, quote.market));
}

/** Keep market filters and evidence counts aligned with the quote display. */
export function hasCompleteForecastLabMarket(comparisons: Comparison[]): boolean {
  return completeForecastLabMarketQuotes(comparisons).length > 0;
}

/**
 * Pick the newest complete quote for a market with stable tie-breaking.
 * The scorecard normally returns one quote per provider/bookmaker, but the
 * browser can receive several sources. Sorting here keeps the Forecast Lab in
 * agreement with the compact forecast board and prevents array order from
 * choosing a stale line.
 */
export function latestForecastLabMarketQuote(
  comparisons: Comparison[],
  market: ForecastLabMarket,
): Comparison | null {
  return comparisons
    .filter((quote) => completeQuote(quote, market))
    .sort((left, right) =>
      clock(right.updated_at || right.captured_at) - clock(left.updated_at || left.captured_at)
      || clock(right.captured_at) - clock(left.captured_at)
      || `${right.provider}|${right.bookmaker}`.localeCompare(`${left.provider}|${left.bookmaker}`),
    )[0] || null;
}
