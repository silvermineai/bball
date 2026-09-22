export type WomensForecastPrediction = {
  home_win_probability: number;
  predicted_margin: number;
  margin_low?: number;
  margin_high?: number;
  predicted_home_score: number;
  predicted_away_score: number;
  estimate_type: string;
};

export type WomensForecastValidation = {
  games: number;
  margin_mae: number;
  win_accuracy: number;
  brier_score: number;
  log_loss?: number;
  interval_coverage?: number;
};

export type WomensForecastCalibration = {
  games?: number;
  interval_target?: number;
};

/**
 * Derive the expected game total from the two scores already published by
 * the women's model. This is display arithmetic, not a new model output; a
 * malformed or incomplete score pair stays unavailable.
 */
export function womensForecastTotal(prediction: Pick<WomensForecastPrediction, "predicted_home_score" | "predicted_away_score"> | null | undefined): number | null {
  if (
    typeof prediction?.predicted_home_score !== "number" || !Number.isFinite(prediction.predicted_home_score)
    || typeof prediction.predicted_away_score !== "number" || !Number.isFinite(prediction.predicted_away_score)
  ) return null;
  return prediction.predicted_home_score + prediction.predicted_away_score;
}

/**
 * Keep the model-quality line on the forecast slate tied to the published
 * held-out and calibration cohorts. Missing optional metrics stay omitted;
 * they are never rendered as zero or as an unqualified quality claim.
 */
export function womensForecastValidationLabel(
  validation: WomensForecastValidation,
  calibration?: WomensForecastCalibration,
) {
  const parts = [
    Number.isFinite(validation.games) ? `held-out validation ${validation.games.toLocaleString()} games` : null,
    Number.isFinite(validation.win_accuracy) ? `${(validation.win_accuracy * 100).toFixed(1)}% winner accuracy` : null,
    Number.isFinite(validation.margin_mae) ? `${validation.margin_mae.toFixed(1)} point margin MAE` : null,
    Number.isFinite(validation.brier_score) ? `Brier ${validation.brier_score.toFixed(3)}` : null,
    Number.isFinite(validation.log_loss) ? `log loss ${validation.log_loss!.toFixed(3)}` : null,
    Number.isFinite(validation.interval_coverage)
      ? `${(validation.interval_coverage! * 100).toFixed(1)}% range coverage${Number.isFinite(calibration?.interval_target) ? ` (target ${(calibration!.interval_target! * 100).toFixed(0)}%)` : ""}`
      : null,
    Number.isFinite(calibration?.games) ? `calibrated on ${calibration!.games!.toLocaleString()} games` : null,
  ];
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

export function womensForecastLabels(prediction: WomensForecastPrediction) {
  const labels = {
    homeWin: `${Math.round(prediction.home_win_probability * 100)}%`,
    margin: `${prediction.predicted_margin >= 0 ? "+" : ""}${prediction.predicted_margin.toFixed(1)}`,
    score: `${prediction.predicted_away_score.toFixed(1)}–${prediction.predicted_home_score.toFixed(1)}`,
    total: womensForecastTotal(prediction)?.toFixed(1),
    estimate: prediction.estimate_type === "primary" ? "Primary" : "Cold start",
  } as { homeWin: string; margin: string; score: string; total?: string; estimate: string; range?: string };
  if (Number.isFinite(prediction.margin_low) && Number.isFinite(prediction.margin_high)) {
    labels.range = `${prediction.margin_low! >= 0 ? "+" : ""}${prediction.margin_low!.toFixed(1)} to ${prediction.margin_high! >= 0 ? "+" : ""}${prediction.margin_high!.toFixed(1)}`;
  }
  return labels;
}
