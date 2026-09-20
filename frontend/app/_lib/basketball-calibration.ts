export type CalibrationSummaryBucket = {
  games: number;
  gap: number;
  interval_coverage: number;
};

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
