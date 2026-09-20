import { describe, expect, it } from "vitest";
import { womensForecastLabels } from "./womens-forecast-display";

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
});
