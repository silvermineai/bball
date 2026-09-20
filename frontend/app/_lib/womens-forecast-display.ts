export type WomensForecastPrediction = {
  home_win_probability: number;
  predicted_margin: number;
  margin_low?: number;
  margin_high?: number;
  predicted_home_score: number;
  predicted_away_score: number;
  estimate_type: string;
};

export function womensForecastLabels(prediction: WomensForecastPrediction) {
  const labels = {
    homeWin: `${Math.round(prediction.home_win_probability * 100)}%`,
    margin: `${prediction.predicted_margin >= 0 ? "+" : ""}${prediction.predicted_margin.toFixed(1)}`,
    score: `${prediction.predicted_away_score.toFixed(1)}–${prediction.predicted_home_score.toFixed(1)}`,
    estimate: prediction.estimate_type === "primary" ? "Primary" : "Cold start",
  } as { homeWin: string; margin: string; score: string; estimate: string; range?: string };
  if (Number.isFinite(prediction.margin_low) && Number.isFinite(prediction.margin_high)) {
    labels.range = `${prediction.margin_low! >= 0 ? "+" : ""}${prediction.margin_low!.toFixed(1)} to ${prediction.margin_high! >= 0 ? "+" : ""}${prediction.margin_high!.toFixed(1)}`;
  }
  return labels;
}
