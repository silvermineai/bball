import type { FootballEfficiencyTransition } from "./data";

export type FootballChallengerStability = {
  transitions: number;
  positive_lift: number;
  negative_lift: number;
  mean_improvement: number | null;
  median_improvement: number | null;
  minimum_improvement: number | null;
  maximum_improvement: number | null;
  positive_share: number | null;
};

/**
 * Summarize only finite, published transition lifts. This is a descriptive
 * stability readout for the research challenger; it never pools games or
 * turns an unavailable transition into zero lift.
 */
export function footballChallengerStability(
  transitions: readonly FootballEfficiencyTransition[] | null | undefined,
): FootballChallengerStability {
  const lifts = (transitions || [])
    .map((row) => row.improvement_vs_primary)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!lifts.length) {
    return {
      transitions: 0,
      positive_lift: 0,
      negative_lift: 0,
      mean_improvement: null,
      median_improvement: null,
      minimum_improvement: null,
      maximum_improvement: null,
      positive_share: null,
    };
  }
  const sorted = [...lifts].sort((left, right) => left - right);
  const positive = lifts.filter((value) => value > 0).length;
  const negative = lifts.filter((value) => value < 0).length;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return {
    transitions: lifts.length,
    positive_lift: positive,
    negative_lift: negative,
    mean_improvement: lifts.reduce((sum, value) => sum + value, 0) / lifts.length,
    median_improvement: median,
    minimum_improvement: sorted[0],
    maximum_improvement: sorted[sorted.length - 1],
    positive_share: positive / lifts.length,
  };
}
