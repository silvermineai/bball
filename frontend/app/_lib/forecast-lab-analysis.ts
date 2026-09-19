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
