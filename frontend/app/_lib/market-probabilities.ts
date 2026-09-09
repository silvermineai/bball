const NOMINAL_80_Z = 1.2815515655446004;

/** Standard normal CDF using a bounded Abramowitz–Stegun approximation. */
export function normalCdf(value: number) {
  if (!Number.isFinite(value)) return value === Infinity ? 1 : 0;
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - polynomial * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

/** Convert a symmetric nominal 80% interval into a normal-approximation SD. */
export function intervalStandardDeviation(low: number | null | undefined, high: number | null | undefined) {
  if (typeof low !== "number" || typeof high !== "number" || !Number.isFinite(low) || !Number.isFinite(high) || high <= low) return null;
  return (high - low) / (2 * NOMINAL_80_Z);
}

/** Probability that the home margin clears an observed American-style spread. */
export function spreadCoverProbability(
  modelMargin: number,
  marginLow: number | null | undefined,
  marginHigh: number | null | undefined,
  observedHomeSpread: number | null | undefined,
) {
  const standardDeviation = intervalStandardDeviation(marginLow, marginHigh);
  if (!Number.isFinite(modelMargin) || standardDeviation == null || standardDeviation <= 0 || typeof observedHomeSpread !== "number" || !Number.isFinite(observedHomeSpread)) return null;
  const threshold = -observedHomeSpread;
  return normalCdf((modelMargin - threshold) / standardDeviation);
}
