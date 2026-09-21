import { describe, expect, it } from "vitest";
import { womensForecastLabels, womensForecastValidationLabel } from "./womens-forecast-display";

describe("womensForecastLabels", () => {
  it("keeps probability, margin, score direction, and estimate type readable", () => {
    expect(womensForecastLabels({
      home_win_probability: 0.5144,
      predicted_margin: 4.2,
      predicted_home_score: 35.5,
      predicted_away_score: 31.3,
      estimate_type: "primary",
    })).toEqual({ homeWin: "51%", margin: "+4.2", score: "31.3–35.5", estimate: "Primary" });
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
