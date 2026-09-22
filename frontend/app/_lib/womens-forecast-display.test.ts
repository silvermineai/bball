import { describe, expect, it } from "vitest";
import { womensAdjustedMatchupInputs, womensForecastLabels, womensForecastTotal, womensForecastValidationLabel } from "./womens-forecast-display";

describe("womensForecastLabels", () => {
  it("keeps probability, margin, score direction, and estimate type readable", () => {
    expect(womensForecastLabels({
      home_win_probability: 0.5144,
      predicted_margin: 4.2,
      predicted_home_score: 35.5,
      predicted_away_score: 31.3,
      estimate_type: "primary",
    })).toEqual({ homeWin: "51%", margin: "+4.2", score: "31.3–35.5", total: "66.8", estimate: "Primary" });
  });

  it("derives a projected total only from finite published scores", () => {
    expect(womensForecastTotal({ predicted_home_score: 35.5, predicted_away_score: 31.3 })).toBeCloseTo(66.8, 5);
    expect(womensForecastTotal({ predicted_home_score: Number.NaN, predicted_away_score: 31.3 })).toBeNull();
    expect(womensForecastTotal(null)).toBeNull();
  });

  it("marks non-primary estimates explicitly", () => {
    expect(womensForecastLabels({
      home_win_probability: 0.2,
      predicted_margin: -3,
      predicted_home_score: 30,
      predicted_away_score: 33,
      estimate_type: "cold_start",
    }).estimate).toBe("Cold start");
  });

  it("shows held-out quality and calibration cohorts without filling missing metrics", () => {
    expect(womensForecastValidationLabel({
      games: 5897,
      margin_mae: 11.2,
      win_accuracy: 0.67,
      brier_score: 0.21,
      log_loss: 0.61,
      interval_coverage: 0.79,
    }, { games: 17339, interval_target: 0.8 })).toBe(
      "held-out validation 5,897 games · 67.0% winner accuracy · 11.2 point margin MAE · Brier 0.210 · log loss 0.610 · 79.0% range coverage (target 80%) · calibrated on 17,339 games",
    );
    expect(womensForecastValidationLabel({ games: 1, margin_mae: 2, win_accuracy: 0.5, brier_score: 0.25 })).toBe(
      "held-out validation 1 games · 50.0% winner accuracy · 2.0 point margin MAE · Brier 0.250",
    );
  });
});

describe("womensAdjustedMatchupInputs", () => {
  const prediction = {
    predicted_margin: 4.2,
    predicted_home_score: 72.1,
    predicted_away_score: 67.9,
    model_inputs: {
      home_adjusted_offense: 70,
      home_adjusted_defense: 66,
      away_adjusted_offense: 67,
      away_adjusted_defense: 68,
      home_adjusted_net: 4,
      away_adjusted_net: -1,
      neutral_court_edge: 5,
      home_court_adjustment: -0.8,
      league_average_points: 65.5,
    },
  };

  it("returns opponent-adjusted units only when they reproduce the forecast", () => {
    expect(womensAdjustedMatchupInputs(prediction)).toEqual(prediction.model_inputs);
    expect(womensAdjustedMatchupInputs({
      ...prediction,
      model_inputs: { ...prediction.model_inputs, neutral_court_edge: 12 },
    })).toBeNull();
    expect(womensAdjustedMatchupInputs({ ...prediction, model_inputs: undefined })).toBeNull();
  });
});
