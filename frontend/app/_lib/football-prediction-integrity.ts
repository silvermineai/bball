/**
 * Forecast scores are published rounded to one decimal while margins and
 * totals may retain two decimals. Keep a small tolerance for that display
 * rounding, but reject rows whose projections cannot describe the same game.
 */
export const FOOTBALL_PREDICTION_ARITHMETIC_TOLERANCE = 0.11;

type FootballPredictionScalars = {
  home_margin: number | null | undefined;
  total: number | null | undefined;
  home_score: number | null | undefined;
  away_score: number | null | undefined;
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Check only arithmetic relationships that have all required operands. This
 * lets a live partial refresh merge safely with a source snapshot while still
 * withholding a complete but internally contradictory prediction.
 */
export function validFootballPredictionArithmetic(
  prediction: FootballPredictionScalars,
  tolerance = FOOTBALL_PREDICTION_ARITHMETIC_TOLERANCE,
) {
  if (!Number.isFinite(tolerance) || tolerance < 0) return false;
  const scores = [prediction.home_score, prediction.away_score];
  if (scores.some((value) => value != null && (!finite(value) || value < 0))) return false;
  if (prediction.total != null && (!finite(prediction.total) || prediction.total < 0)) return false;
  if (prediction.home_margin != null && !finite(prediction.home_margin)) return false;
  if (scores.every(finite)) {
    if (finite(prediction.home_margin)
      && Math.abs((prediction.home_score! - prediction.away_score!) - prediction.home_margin) > tolerance) return false;
    if (finite(prediction.total)
      && Math.abs((prediction.home_score! + prediction.away_score!) - prediction.total) > tolerance) return false;
  }
  return true;
}

