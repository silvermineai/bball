export type NumericStats = Record<string, number | null | undefined>;

/** Return a rate only when both source fields are present and the denominator is positive. */
export function safeRate(made: number | null | undefined, attempted: number | null | undefined) {
  return made != null && attempted != null && attempted > 0 ? made / attempted : null;
}

/** Sum a composite stat only when every source component is present. */
export function safeSum(left: number | null | undefined, right: number | null | undefined) {
  return left != null && right != null ? left + right : null;
}

/** Compute eFG% only when makes, threes and attempts are all source-reported. */
export function effectiveFieldGoal(
  fieldGoalsMade: number | null | undefined,
  threesMade: number | null | undefined,
  fieldGoalAttempts: number | null | undefined,
) {
  return fieldGoalsMade != null && threesMade != null
    ? safeRate(fieldGoalsMade + 0.5 * threesMade, fieldGoalAttempts)
    : null;
}

/** Compute the disclosed college TS% fallback without turning missing fields into zero. */
export function trueShooting(stats: NumericStats) {
  const points = stats.pts;
  const fga = stats.fga;
  const fta = stats.fta;
  if (points == null || fga == null || fta == null) return null;
  const denominator = 2 * (fga + 0.475 * fta);
  return denominator > 0 ? points / denominator : null;
}
