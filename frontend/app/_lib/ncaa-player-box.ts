export type NumericStats = Record<string, number | null | undefined>;

/** Return a rate only when both source fields are present and the denominator is positive. */
export function safeRate(made: number | null | undefined, attempted: number | null | undefined) {
  return made != null && attempted != null && attempted > 0 ? made / attempted : null;
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
