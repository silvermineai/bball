/**
 * Classify the timing evidence retained with an archival market row.
 *
 * A line can be a well-formed quote and still be unusable for prospective
 * evaluation when it was captured after tip. Keep that distinction visible in
 * the archive instead of calling every retained row a verified pregame quote.
 */
export function marketArchiveTimingLabel(value: number | null | undefined): string {
  if (value === 1) return "Pregame capture";
  if (value === 0) return "Post-tip capture";
  return "Timing unavailable";
}

export type MarketArchiveMarketFilter = "all" | "spreads" | "totals" | "h2h";
export type MarketArchiveTimingFilter = "all" | "pregame" | "postgame";

/**
 * Explain an empty archive result caused by the selected filters.
 *
 * Keep this separate from connector coverage: zero rows for one market or
 * timing cohort do not establish that the sport has no retained observations.
 */
export function marketArchiveFilterEmptyState(
  market: MarketArchiveMarketFilter,
  timing: MarketArchiveTimingFilter,
): { heading: string; detail: string } | null {
  const filters: string[] = [];
  if (market !== "all") filters.push(market === "h2h" ? "moneyline" : market);
  if (timing !== "all") filters.push(timing === "pregame" ? "pregame" : "postgame");
  if (!filters.length) return null;

  return {
    heading: `No ${filters.join(" / ")} observations match these filters.`,
    detail: "Other retained market rows may exist outside the selected filters. This empty result does not establish that no line was available.",
  };
}
