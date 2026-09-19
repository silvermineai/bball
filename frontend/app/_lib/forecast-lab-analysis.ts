import type { BBFactorKey, BBGame, BBMatchupFactors, BBPrediction } from "./basketball-types";

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

export type ForecastSignalContext = {
  estimate: "primary" | "cold-start" | "unavailable";
  label: "Strong signal" | "Lean signal" | "Near even" | "Cold-start estimate" | "Unavailable";
  probability_edge_pp: number | null;
  range_width: number | null;
};

/**
 * Put the probability and interval into a small, honest decision context.
 * The label is descriptive only: it does not turn a model probability into a
 * betting recommendation. Invalid stored values stay unavailable so a broken
 * row cannot look like a weak or strong signal in the matchup table.
 */
export function forecastSignalContext(
  prediction: BBPrediction | null | undefined,
  primary: boolean,
): ForecastSignalContext {
  if (!prediction) {
    return { estimate: "unavailable", label: "Unavailable", probability_edge_pp: null, range_width: null };
  }
  const values = [
    prediction.home_win_probability,
    prediction.margin_low,
    prediction.margin_high,
  ];
  if (
    values.some((value) => !Number.isFinite(value))
    || prediction.home_win_probability < 0
    || prediction.home_win_probability > 1
    || prediction.margin_low > prediction.margin_high
  ) {
    return { estimate: "unavailable", label: "Unavailable", probability_edge_pp: null, range_width: null };
  }
  const probabilityEdge = Math.abs(prediction.home_win_probability - 0.5) * 100;
  const rangeWidth = prediction.margin_high - prediction.margin_low;
  if (!primary || prediction.estimate_type === "cold_start") {
    return {
      estimate: "cold-start",
      label: "Cold-start estimate",
      probability_edge_pp: Number(probabilityEdge.toFixed(1)),
      range_width: Number(rangeWidth.toFixed(1)),
    };
  }
  const strongestProbability = Math.max(prediction.home_win_probability, 1 - prediction.home_win_probability);
  const label = strongestProbability >= 0.75
    ? "Strong signal"
    : strongestProbability >= 0.6
      ? "Lean signal"
      : "Near even";
  return {
    estimate: "primary",
    label,
    probability_edge_pp: Number(probabilityEdge.toFixed(1)),
    range_width: Number(rangeWidth.toFixed(1)),
  };
}

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
