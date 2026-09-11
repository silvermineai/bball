export type NumericStats = Record<string, number | null | undefined>;

/** Return a rate only when both source fields are present and the denominator is positive. */
export function safeRate(made: number | null | undefined, attempted: number | null | undefined) {
  return made != null && attempted != null && attempted > 0 ? made / attempted : null;
}

/** Sum a composite stat only when every source component is present. */
export function safeSum(left: number | null | undefined, right: number | null | undefined) {
  return left != null && right != null ? left + right : null;
}

/**
 * Pool one source stat across team rows only when every stint contains a
 * finite value. A partial season total would turn an unknown stint into a
 * false zero and make a rate look more complete than its source evidence.
 */
export function completeStatsSum(
  rows: ReadonlyArray<{ stats: NumericStats }>,
  key: string,
) {
  if (!rows.length) return null;
  const values = rows.map((row) => row.stats[key]);
  if (!values.every((value): value is number => typeof value === "number" && Number.isFinite(value))) return null;
  return values.reduce((total, value) => total + value, 0);
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

/** Derive compact source rates for a player card without imputing missing fields. */
export function playerAdvancedRates(stats: NumericStats) {
  return {
    pointsPerPossession: safeRate(stats.pts, stats.o_poss),
    threePointAttemptRate: safeRate(stats.tpa, stats.fga),
    freeThrowAttemptRate: safeRate(stats.fta, stats.fga),
    assistRate: safeRate(stats.ast, stats.o_poss),
    turnoverRate: safeRate(stats.tov, stats.o_poss),
  };
}
