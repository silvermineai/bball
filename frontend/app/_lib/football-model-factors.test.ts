import { describe, expect, it } from "vitest";
import { footballCalibrationReliability, footballCalibrationSummary, footballModelFactors } from "./football-model-factors";

const model = {
  teams: ["away", "home", "other"],
  margin_coef: [2, 3, 4, 5, 6],
  total_coef: [40, 1, 10, 20, 30],
};

describe("football model factor decomposition", () => {
  it("maps home probabilities to the held-out reliability band", () => {
    expect(footballCalibrationReliability(0.72, [
      { lower: 0.7, upper: 0.8, games: 137, predicted: 0.7439, observed: 0.7226 },
    ])).toEqual({
      side: "Home",
      strongest_probability: 0.72,
      confidence_lower: 0.7,
      confidence_upper: 0.8,
      games: 137,
      predicted: 0.7439,
      observed: 0.7226,
      observed_gap_pp: -2.1,
    });
  });

  it("inverts the home bin for an away-favored forecast", () => {
    expect(footballCalibrationReliability(0.28, [
      { lower: 0.2, upper: 0.3, games: 25, predicted: 0.2599, observed: 0.16 },
    ])).toMatchObject({
      side: "Away",
      strongest_probability: 0.72,
      confidence_lower: 0.7,
      confidence_upper: 0.8,
      games: 25,
      predicted: 0.7401,
      observed: 0.84,
      observed_gap_pp: 10,
    });
  });

  it("fails closed for empty, malformed, or unobserved bins", () => {
    expect(footballCalibrationReliability(0.72, [{ lower: 0.7, upper: 0.8, games: 0, predicted: 0.74, observed: 0.72 }])).toBeNull();
    expect(footballCalibrationReliability(Number.NaN, [])).toBeNull();
    expect(footballCalibrationReliability(0.72, [{ lower: 0.8, upper: 0.7, games: 10, predicted: 0.8, observed: 0.8 }])).toBeNull();
  });

  it("explains the registered probability and range calibration", () => {
    expect(footballCalibrationSummary({ games: 120, binary_games: 118, logistic_coefficients: [-0.2, 0.08], margin_half_width: 14.25 }))
      .toBe("Home-win probability is a logistic mapping of modeled margin, calibrated on 118 binary games; the published 80% margin range uses a 14.3-point half-width.");
    expect(footballCalibrationSummary({ games: 0, binary_games: 0, logistic_coefficients: [], margin_half_width: 0 })).toBeNull();
  });

  it("reconstructs margin and total from the registered feature order", () => {
    const factors = footballModelFactors(model, { home_id: "home", away_id: "away", neutral: 0 });
    expect(factors).toEqual({
      margin: { intercept: 2, venue: 3, home_team: 5, away_team: -4, estimate: 6 },
      total: { intercept: 40, venue: 1, home_team: 20, away_team: 10, estimate: 71 },
    });
  });

  it("removes home-field contribution for a neutral site", () => {
    const factors = footballModelFactors(model, { home_id: "home", away_id: "away", neutral: 1 });
    expect(factors?.margin.venue).toBe(0);
    expect(factors?.total.venue).toBe(0);
  });

  it("fails closed when a team is outside the model edition", () => {
    expect(footballModelFactors(model, { home_id: "unknown", away_id: "away", neutral: 0 })).toBeNull();
  });
});
