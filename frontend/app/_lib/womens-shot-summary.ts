export type WomensShotTendency = {
  label: string;
  attempts: number;
  makes: number;
};

export type WomensShotTendencyStat = WomensShotTendency & {
  share: number;
  makeRate: number | null;
};

/**
 * Calculate tendency shares against located attempts only. Missing locations
 * remain in the profile total and cannot silently dilute a court-region rate.
 */
export function womensShotTendencyStats(
  rows: readonly WomensShotTendency[],
  locatedAttempts: number,
): WomensShotTendencyStat[] {
  const denominator = Number.isFinite(locatedAttempts) && locatedAttempts > 0 ? locatedAttempts : 0;
  return rows.map((row) => {
    const attempts = Number.isFinite(row.attempts) && row.attempts >= 0 ? row.attempts : 0;
    const validMakes = Number.isFinite(row.makes) && row.makes >= 0 && row.makes <= attempts;
    const makes = validMakes ? row.makes : 0;
    return {
      ...row,
      attempts,
      makes,
      share: denominator ? attempts / denominator : 0,
      makeRate: attempts && validMakes ? makes / attempts : null,
    };
  });
}
