import type { BBFactorKey, BBGame, BBMatchupFactors, BBPrediction } from "./basketball-types";
import type { BBOverview } from "./basketball-types";
import { isUsableBasketballPrediction } from "./basketball-matchups";

const FACTORS: ReadonlyArray<{ key: BBFactorKey; label: string }> = [
  { key: "efg", label: "Shot quality" },
  { key: "tov", label: "Ball security" },
  { key: "orb", label: "Second chances" },
  { key: "ftr", label: "Free-throw pressure" },
];

export type ForecastModelEvidence = {
  state: "matched" | "mismatch" | "unavailable";
  modelId: string | null;
  forecastModelId: string | null;
  holdoutSeason: number | null;
  games: number | null;
  winnerAccuracy: number | null;
  marginMae: number | null;
  baselineMarginMae: number | null;
  intervalCoverage: number | null;
  improvementVsBaseline: number | null;
};

const modelIdText = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

const boundedRate = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;

const nonNegative = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

const positiveInteger = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

const integer = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) ? value : null;

/**
 * Keep historical model performance beside a forecast only when both records
 * identify the same immutable edition. A static overview can outlive the
 * latest live forecast, so showing its accuracy beside a newer row would be a
 * misleading claim even when every metric is individually well formed.
 */
export function forecastModelEvidence(
  model: { id?: unknown; evaluation?: Partial<BBOverview["model"]["evaluation"]> } | null | undefined,
  forecastModelId: string | null | undefined,
): ForecastModelEvidence {
  const modelId = modelIdText(model?.id);
  const liveId = modelIdText(forecastModelId);
  const evaluation = model?.evaluation;
  const holdoutSeason = integer(evaluation?.season);
  const games = positiveInteger(evaluation?.games);
  const winnerAccuracy = boundedRate(evaluation?.winner_accuracy);
  const marginMae = nonNegative(evaluation?.margin_mae);
  const baselineMarginMae = nonNegative(evaluation?.baseline_margin_mae);
  const intervalCoverage = boundedRate(evaluation?.interval_coverage);
  const complete = !!modelId && !!liveId && holdoutSeason != null && games != null && winnerAccuracy != null && marginMae != null;
  const state = !complete ? "unavailable" : modelId === liveId ? "matched" : "mismatch";
  return {
    state,
    modelId,
    forecastModelId: liveId,
    holdoutSeason,
    games,
    winnerAccuracy,
    marginMae,
    baselineMarginMae,
    intervalCoverage,
    improvementVsBaseline: baselineMarginMae != null && marginMae != null
      ? Number((baselineMarginMae - marginMae).toFixed(2))
      : null,
  };
}

/**
 * Turn a Four Factor contrast into a film question. These prompts are
 * deliberately descriptive: they teach the reader what to inspect without
 * treating a historical rate, or a stale context edition, as a forecast input.
 */
const FACTOR_STUDY_QUESTIONS: Record<BBFactorKey, string> = {
  efg: "Which actions create efficient looks, and which coverage takes them away?",
  tov: "Which ball handlers face pressure, and are the losses live-ball or dead-ball?",
  orb: "Who earns second chances without giving up transition at the other end?",
  ftr: "Which actions draw shooting fouls, and which defenders can contain without fouling?",
};

export function matchupFactorStudyQuestion(factor: BBFactorKey): string {
  return FACTOR_STUDY_QUESTIONS[factor];
}

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

export type ForecastIntegrity = {
  ok: boolean;
  label: "Verified record" | "Review before prep";
  missing: string[];
};

/**
 * Keep the card's integrity claim narrower than its evidence/readiness score.
 * A missing schedule clock or roster scenario is a coverage gap; malformed
 * prediction values, an unlabeled edition, or mismatched factor lineage are
 * reasons to pause before using the row for game prep.
 */
export function forecastIntegrity(
  game: Pick<BBGame, "prediction" | "fallback_prediction" | "forecast_model_id" | "matchup_factors" | "matchup_factors_same_edition">,
  publishedModelId?: string | null,
): ForecastIntegrity {
  const prediction = game.prediction || game.fallback_prediction;
  const missing: string[] = [];
  // The compact signal context accepts partial values for backwards-compatible
  // cards. The integrity badge is a stronger claim: require the complete
  // score/total/pace contract and its arithmetic identities before calling a
  // forecast safe to use in matchup preparation.
  if (!isUsableBasketballPrediction(prediction)) {
    missing.push("valid prediction values");
  }
  if (!(game.forecast_model_id || publishedModelId)) {
    missing.push("forecast edition");
  }
  if (game.matchup_factors && game.matchup_factors_same_edition === false) {
    missing.push("same-edition factor context");
  }
  return {
    ok: missing.length === 0,
    label: missing.length === 0 ? "Verified record" : "Review before prep",
    missing,
  };
}

/** Give each game card a compact, evidence-first readiness label. */
export function forecastEvidenceLabel(evidence: ForecastEvidenceCoverage): string {
  if (!evidence.complete) return `${evidence.present}/${evidence.total} core evidence`;
  return evidence.market === "verified" ? "Core packet + market" : "Core packet; market pending";
}

/** Explain the specific missing evidence without treating absent markets as model errors. */
export function forecastEvidenceDetail(evidence: ForecastEvidenceCoverage): string {
  const missing = evidence.missing.length ? `Missing: ${evidence.missing.join(", ")}.` : "Core model evidence is present.";
  return evidence.market === "verified"
    ? `${missing} A qualifying pregame market quote is attached.`
    : `${missing} No qualifying pregame market quote is attached; no market edge is inferred.`;
}

/** Preserve the model's explicit cold-start reason while rejecting malformed names. */
export function forecastUnknownTeams(prediction: BBPrediction | null | undefined): string[] {
  if (!prediction || prediction.estimate_type !== "cold_start" || !Array.isArray(prediction.unknown_teams)) return [];
  return [...new Set(
    prediction.unknown_teams
      .filter((team): team is string => typeof team === "string")
      .map((team) => team.trim())
      .filter(Boolean),
  )];
}

export type ForecastSignalContext = {
  estimate: "primary" | "cold-start" | "unavailable";
  label: "Strong signal" | "Lean signal" | "Near even" | "Cold-start estimate" | "Unavailable";
  probability_edge_pp: number | null;
  range_width: number | null;
  range_context: "Range crosses even" | "Range stays home side" | "Range stays away side" | "Unavailable";
};

export type ForecastConfidenceSummary = ForecastSignalContext & {
  /** The side represented by the strongest stored win probability. */
  strongest_side: "Home" | "Away" | "Even" | "Unavailable";
  /** Kept null when the prediction fails the same integrity checks as the signal context. */
  strongest_probability: number | null;
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
    return { estimate: "unavailable", label: "Unavailable", probability_edge_pp: null, range_width: null, range_context: "Unavailable" };
  }
  const values = [
    prediction.home_margin,
    prediction.home_win_probability,
    prediction.margin_low,
    prediction.margin_high,
  ];
  if (
    values.some((value) => !Number.isFinite(value))
    || prediction.home_win_probability < 0
    || prediction.home_win_probability > 1
    || prediction.margin_low > prediction.margin_high
    || prediction.home_margin < prediction.margin_low
    || prediction.home_margin > prediction.margin_high
  ) {
    return { estimate: "unavailable", label: "Unavailable", probability_edge_pp: null, range_width: null, range_context: "Unavailable" };
  }
  const probabilityEdge = Math.abs(prediction.home_win_probability - 0.5) * 100;
  const rangeWidth = prediction.margin_high - prediction.margin_low;
  const rangeContext = prediction.margin_low <= 0 && prediction.margin_high >= 0
    ? "Range crosses even"
    : prediction.margin_low > 0
      ? "Range stays home side"
      : "Range stays away side";
  if (!primary || prediction.estimate_type === "cold_start") {
    return {
      estimate: "cold-start",
      label: "Cold-start estimate",
      probability_edge_pp: Number(probabilityEdge.toFixed(1)),
      range_width: Number(rangeWidth.toFixed(1)),
      range_context: rangeContext,
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
    range_context: rangeContext,
  };
}

/**
 * Give matchup cards one compact, auditable confidence read. This is only a
 * restatement of the stored probability and calibrated range; it never adds a
 * market line or turns an unavailable value into a default.
 */
export function forecastConfidenceSummary(
  prediction: BBPrediction | null | undefined,
  primary: boolean,
): ForecastConfidenceSummary {
  const context = forecastSignalContext(prediction, primary);
  if (!prediction || context.estimate === "unavailable") {
    return { ...context, strongest_side: "Unavailable", strongest_probability: null };
  }
  const strongestProbability = Math.max(prediction.home_win_probability, 1 - prediction.home_win_probability);
  return {
    ...context,
    strongest_side: prediction.home_win_probability === 0.5
      ? "Even"
      : prediction.home_win_probability > 0.5
        ? "Home"
        : "Away",
    strongest_probability: strongestProbability,
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
  sameEdition = true,
): ForecastMatchupSignal | null {
  if (!sameEdition || !factors || !Number.isInteger(factors.season)) return null;
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
