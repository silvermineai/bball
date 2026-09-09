/** Convert American odds into the bookmaker's raw implied probability. */
export function americanOddsToImplied(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

/** Remove the two-way overround by normalizing both implied probabilities. */
export function noVigProbability(
  odds: number | null | undefined,
  opposingOdds: number | null | undefined,
) {
  const implied = americanOddsToImplied(odds);
  const opposing = americanOddsToImplied(opposingOdds);
  if (implied == null || opposing == null || implied + opposing <= 0) return null;
  return implied / (implied + opposing);
}

/** Expected profit per one unit staked, using a model probability and American odds. */
export function expectedValuePerUnit(
  modelProbability: number,
  odds: number | null | undefined,
) {
  if (!Number.isFinite(modelProbability) || modelProbability < 0 || modelProbability > 1) return null;
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  const profit = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  return modelProbability * profit - (1 - modelProbability);
}

export function overround(
  odds: number | null | undefined,
  opposingOdds: number | null | undefined,
) {
  const implied = americanOddsToImplied(odds);
  const opposing = americanOddsToImplied(opposingOdds);
  if (implied == null || opposing == null) return null;
  return implied + opposing - 1;
}
