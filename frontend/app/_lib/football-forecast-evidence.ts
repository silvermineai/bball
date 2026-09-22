import type { Game, Overview } from "./data";
import { footballModelFactors } from "./football-model-factors";

export type FootballForecastDivision = "d1" | "d2" | "d3";

export type FootballForecastEvidence = {
  state: "verified" | "review" | "unavailable";
  division: FootballForecastDivision | null;
  reasons: string[];
  reconstruction: {
    margin_delta: number;
    total_delta: number;
    score_margin_delta: number;
    score_total_delta: number;
  } | null;
};

export type FootballForecastAvailability = {
  state: "forecasted" | "unseen_team" | "out_of_scope" | "division_unavailable" | "missing";
  label: string;
  detail: string;
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Normalize only the competition labels used by the retained football edition. */
export function footballForecastDivision(value: unknown): FootballForecastDivision | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["fbs", "fcs", "d1", "division1", "divisioni"].includes(normalized)) return "d1";
  if (["d2", "division2", "divisionii"].includes(normalized)) return "d2";
  if (["d3", "division3", "divisioniii"].includes(normalized)) return "d3";
  return null;
}

/**
 * Explain why a scheduled football game does not have a score estimate.
 *
 * The overview intentionally leaves out unsupported games rather than
 * manufacturing a probability. Keeping this explanation beside the card
 * makes the coverage boundary actionable: an unseen D1 team is different
 * from a lower-division game and from a schedule row whose division cannot
 * be joined exactly.
 */
export function footballForecastAvailability(
  game: Pick<Game, "home_id" | "away_id" | "home_name" | "away_name" | "home_division" | "away_division" | "prediction">,
  modelTeams: readonly string[] = [],
): FootballForecastAvailability {
  if (game.prediction) {
    return { state: "forecasted", label: "Forecast available", detail: "A registered model estimate is attached to this game." };
  }
  const homeDivision = footballForecastDivision(game.home_division);
  const awayDivision = footballForecastDivision(game.away_division);
  if (!homeDivision || !awayDivision || homeDivision !== awayDivision) {
    return {
      state: "division_unavailable",
      label: "Division scope unavailable",
      detail: "No estimate: the retained schedule does not provide one exact division for both teams.",
    };
  }
  if (homeDivision !== "d1") {
    return {
      state: "out_of_scope",
      label: "Outside primary model scope",
      detail: "No estimate: the primary model is FBS-only; lower-division schedules remain available for research.",
    };
  }
  const known = new Set(modelTeams.map(String));
  const unseen = [
    known.has(String(game.away_id)) ? null : game.away_name || String(game.away_id),
    known.has(String(game.home_id)) ? null : game.home_name || String(game.home_id),
  ].filter((name): name is string => Boolean(name));
  if (unseen.length) {
    return {
      state: "unseen_team",
      label: "Model coverage gap",
      detail: `No estimate: ${unseen.join(" and ")} is outside the trained FBS team field.`,
    };
  }
  return {
    state: "missing",
    label: "Forecast unavailable",
    detail: "Both teams are in the trained field, but no valid forecast row is published for this edition.",
  };
}

/**
 * Check that an upcoming football forecast still belongs to one exact
 * division and that its displayed values can be rebuilt from the registered
 * coefficient edition. Missing or contradictory evidence stays reviewable;
 * it is never converted into a passing estimate.
 */
export function footballForecastEvidence(
  game: Pick<Game, "home_id" | "away_id" | "home_division" | "away_division" | "neutral" | "prediction">,
  model: Pick<Overview["model"], "teams" | "margin_coef" | "total_coef"> | undefined,
  expectedModelId?: string | null,
): FootballForecastEvidence {
  const homeDivision = footballForecastDivision(game.home_division);
  const awayDivision = footballForecastDivision(game.away_division);
  const division = homeDivision && homeDivision === awayDivision ? homeDivision : null;
  const reasons: string[] = [];
  const prediction = game.prediction;
  if (!division) reasons.push("mixed or unknown division");
  if (!prediction) {
    reasons.push("no published forecast");
    return { state: "unavailable", division, reasons, reconstruction: null };
  }

  const values = [
    prediction.home_margin,
    prediction.total,
    prediction.home_score,
    prediction.away_score,
    prediction.home_win_probability,
    prediction.margin_low,
    prediction.margin_high,
  ];
  if (!values.every(finite) || prediction.total < 0 || prediction.home_win_probability < 0 || prediction.home_win_probability > 1) {
    reasons.push("invalid forecast values");
  }
  if (finite(prediction.margin_low) && finite(prediction.margin_high) && prediction.margin_low > prediction.margin_high) {
    reasons.push("invalid margin range");
  }
  if (finite(prediction.home_margin) && finite(prediction.margin_low) && finite(prediction.margin_high)
    && (prediction.home_margin < prediction.margin_low || prediction.home_margin > prediction.margin_high)) {
    reasons.push("margin outside published range");
  }
  if (expectedModelId && prediction.model_id !== expectedModelId) reasons.push("model edition mismatch");
  if (expectedModelId && !prediction.model_id) reasons.push("model edition missing");

  const factors = model && footballModelFactors(model, game);
  let reconstruction: FootballForecastEvidence["reconstruction"] = null;
  if (!factors) {
    reasons.push("registered coefficients unavailable");
  } else if (values.every(finite)) {
    reconstruction = {
      margin_delta: prediction.home_margin - factors.margin.estimate,
      total_delta: prediction.total - factors.total.estimate,
      score_margin_delta: prediction.home_margin - (prediction.home_score - prediction.away_score),
      score_total_delta: prediction.total - (prediction.home_score + prediction.away_score),
    };
    if (Math.abs(reconstruction.margin_delta) > 0.06 || Math.abs(reconstruction.total_delta) > 0.06) reasons.push("displayed forecast differs from registered coefficients");
    if (Math.abs(reconstruction.score_margin_delta) > 0.16 || Math.abs(reconstruction.score_total_delta) > 0.16) reasons.push("score components do not reconcile");
  }
  return {
    state: reasons.length ? "review" : "verified",
    division,
    reasons,
    reconstruction,
  };
}
