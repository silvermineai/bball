export type WomensForecastPrediction = {
  home_win_probability: number;
  predicted_margin: number;
  predicted_home_score: number;
  predicted_away_score: number;
  estimate_type: string;
};

export function womensForecastLabels(prediction: WomensForecastPrediction) {
  return {
    homeWin: `${Math.round(prediction.home_win_probability * 100)}%`,
    margin: `${prediction.predicted_margin >= 0 ? "+" : ""}${prediction.predicted_margin.toFixed(1)}`,
    score: `${prediction.predicted_away_score.toFixed(1)}–${prediction.predicted_home_score.toFixed(1)}`,
    estimate: prediction.estimate_type === "primary" ? "Primary" : "Cold start",
  };
}
