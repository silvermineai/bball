import type { LedgerGame } from "./research-types";

type MarketReadiness = NonNullable<LedgerGame["market_readiness"]>;

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

/**
 * Explain a missing line as an evidence state, never as a zero model edge.
 * The API returns the underlying counters; this formatter keeps the compact
 * game ledger readable without trusting an arbitrary prose string.
 */
export function gameMarketReadinessLabel(readiness: MarketReadiness | undefined): string {
  if (!readiness) return "Market qualification unavailable";
  if (readiness.status === "available") {
    const selected = count(readiness.selected_comparisons);
    return selected
      ? `${selected} qualified pregame ${selected === 1 ? "quote" : "quotes"}`
      : "Qualified pregame quote";
  }
  if (readiness.status === "forecast_excluded") return "Forecast excluded from market comparison";
  if (readiness.status !== "no_qualified_line") return "Market qualification unavailable";

  const retained = count(readiness.retained_observations);
  const eligible = count(readiness.eligible_observations);
  const comparable = count(readiness.comparable_observations);
  if (!retained) return "No retained pregame line";
  if (!eligible) return "Retained line failed identity or timing checks";
  if (!comparable) return "Retained line lacks comparable model values";
  return "No qualified pregame line";
}

/** Stable CSV fields so a downloaded scorecard preserves why no line appears. */
export function gameMarketReadinessExport(readiness: MarketReadiness | undefined): string[] {
  const counts = readiness
    ? [
      count(readiness.retained_observations),
      count(readiness.eligible_observations),
      count(readiness.comparable_observations),
      count(readiness.selected_comparisons),
    ]
    : ["", "", "", ""];
  return [readiness?.status || "unavailable", gameMarketReadinessLabel(readiness), ...counts.map(String)];
}
