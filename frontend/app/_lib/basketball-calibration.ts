export type CalibrationSummaryBucket = {
  games: number;
  gap: number;
  interval_coverage: number;
};

export type BasketballCalibrationBucket = {
  lower: number;
  upper: number;
  games: number;
  predicted: number;
  observed: number;
};

export type BasketballCalibrationContext = {
  side: "Home" | "Away";
  confidence_lower: number;
  confidence_upper: number;
  games: number;
  predicted: number | null;
  observed: number | null;
  observed_gap_pp: number | null;
};

const validCalibrationBucket = (bucket: BasketballCalibrationBucket) =>
  Number.isFinite(bucket.lower)
  && Number.isFinite(bucket.upper)
  && bucket.upper > bucket.lower
  && bucket.lower >= 0
  && bucket.upper <= 1.01
  && Number.isInteger(bucket.games)
  && bucket.games > 0
  && Number.isFinite(bucket.predicted)
  && bucket.predicted >= 0
  && bucket.predicted <= 1
  && Number.isFinite(bucket.observed)
  && bucket.observed >= 0
  && bucket.observed <= 1;

/**
 * Attach an upcoming estimate to the populated held-out probability band that
 * calibrated its mapping. Away probabilities are inverted so the reader sees
 * the historical result for the side the model favors. Missing or malformed
 * buckets remain unavailable rather than becoming a confidence claim.
 */
export function basketballCalibrationContext(
  homeWinProbability: number,
  buckets: readonly BasketballCalibrationBucket[] | null | undefined,
): BasketballCalibrationContext | null {
  if (!Number.isFinite(homeWinProbability) || homeWinProbability < 0 || homeWinProbability > 1 || !Array.isArray(buckets)) return null;
  const bucket = buckets.find((candidate) => validCalibrationBucket(candidate)
    && homeWinProbability >= candidate.lower
    && (homeWinProbability < candidate.upper || (homeWinProbability === 1 && candidate.upper > 1)));
  if (!bucket) return null;
  const homeSide = homeWinProbability >= 0.5;
  const predicted = homeSide ? bucket.predicted : 1 - bucket.predicted;
  const observed = homeSide ? bucket.observed : 1 - bucket.observed;
  return {
    side: homeSide ? "Home" : "Away",
    confidence_lower: homeSide ? bucket.lower : Math.max(0, 1 - bucket.upper),
    confidence_upper: homeSide ? Math.min(1, bucket.upper) : Math.min(1, 1 - bucket.lower),
    games: bucket.games,
    predicted,
    observed,
    observed_gap_pp: Number(((observed - predicted) * 100).toFixed(1)),
  };
}

export type BasketballCalibrationSummary = {
  games: number;
  expectedCalibrationError: number | null;
  maximumAbsoluteGap: number | null;
  intervalCoverage: number | null;
};

/**
 * Summarize probability reliability using the published calibration buckets.
 * Every aggregate is weighted by the bucket's held-out game count; empty or
 * invalid buckets contribute no denominator and cannot become a false zero.
 */
export function basketballCalibrationSummary(
  buckets: readonly CalibrationSummaryBucket[],
): BasketballCalibrationSummary {
  const valid = buckets.filter((bucket) =>
    Number.isInteger(bucket.games) && bucket.games > 0
    && Number.isFinite(bucket.gap)
    && Number.isFinite(bucket.interval_coverage),
  );
  const games = valid.reduce((total, bucket) => total + bucket.games, 0);
  if (!games) {
    return { games: 0, expectedCalibrationError: null, maximumAbsoluteGap: null, intervalCoverage: null };
  }
  const weightedGap = valid.reduce((total, bucket) => total + Math.abs(bucket.gap) * bucket.games, 0);
  const weightedCoverage = valid.reduce((total, bucket) => total + bucket.interval_coverage * bucket.games, 0);
  return {
    games,
    expectedCalibrationError: weightedGap / games,
    maximumAbsoluteGap: Math.max(...valid.map((bucket) => Math.abs(bucket.gap))),
    intervalCoverage: weightedCoverage / games,
  };
}
