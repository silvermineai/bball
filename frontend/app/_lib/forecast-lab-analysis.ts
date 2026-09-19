import type { BBFactorKey, BBGame, BBMatchupFactors } from "./basketball-types";

const FACTORS: ReadonlyArray<{ key: BBFactorKey; label: string }> = [
  { key: "efg", label: "Shot quality" },
  { key: "tov", label: "Ball security" },
  { key: "orb", label: "Second chances" },
  { key: "ftr", label: "Free-throw pressure" },
];

export type ForecastMatchupSignal = {
  factor: BBFactorKey;
  label: string;
  edge: number;
  season: number;
};

export type ForecastEvidenceCoverage = {
  present: number;
  total: number;
  missing: string[];
  complete: boolean;
  market: "verified" | "unavailable";
};

/**
 * Summarize the evidence needed to turn a forecast row into a usable matchup
 * brief. Market evidence stays separate because a missing quote is unknown
 * context, not a defect in the basketball forecast itself.
 */
export function forecastEvidenceCoverage({
  primary,
  scheduled,
  factors,
  roster,
  market,
}: {
  primary: boolean;
  scheduled: boolean;
  factors: boolean;
  roster: boolean;
  market: boolean;
}): ForecastEvidenceCoverage {
  const checks = [
    [primary, "primary team model"],
    [scheduled, "confirmed tip time"],
    [factors, "same-edition Four Factors"],
    [roster, "roster continuity scenario"],
  ] as const;
  const missing = checks.filter(([available]) => !available).map(([, label]) => label);
  return {
    present: checks.length - missing.length,
    total: checks.length,
    missing,
    complete: missing.length === 0,
    market: market ? "verified" : "unavailable",
  };
}

/**
 * Keep one auditable Four Factor mismatch per game for the full-slate lab.
 * The value is a descriptive rate gap, not a point contribution to the model.
 */
export function strongestMatchupSignal(
  factors: BBMatchupFactors | null | undefined,
): ForecastMatchupSignal | null {
  if (!factors || !Number.isInteger(factors.season)) return null;
  return FACTORS.reduce<ForecastMatchupSignal | null>((best, factor) => {
    const edge = factors.edges[factor.key];
    if (edge == null || !Number.isFinite(edge)) return best;
    const candidate: ForecastMatchupSignal = {
      factor: factor.key,
      label: factor.label,
      edge,
      season: factors.season,
    };
    return !best || Math.abs(candidate.edge) > Math.abs(best.edge) ? candidate : best;
  }, null);
}

export function compactMatchupSignals(games: BBGame[]): Record<string, ForecastMatchupSignal> {
  return Object.fromEntries(
    games.flatMap((game) => {
      const signal = strongestMatchupSignal(game.matchup_factors);
      return signal ? [[game.id, signal] as const] : [];
    }),
  );
}
