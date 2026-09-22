import { describe, expect, it } from "vitest";
import { validFootballPredictionArithmetic } from "./football-prediction-integrity";

const prediction = (overrides: Record<string, number | null> = {}) => ({
  home_margin: 4.02,
  total: 48.01,
  home_score: 26.0,
  away_score: 22.0,
  ...overrides,
});

describe("validFootballPredictionArithmetic", () => {
  it("allows rounded scores to support the published margin and total", () => {
    expect(validFootballPredictionArithmetic(prediction({ home_margin: 4.1, total: 48.1 }))).toBe(true);
  });

  it("rejects a complete forecast whose margin or total disagrees with its scores", () => {
    expect(validFootballPredictionArithmetic(prediction({ home_margin: 8 }))).toBe(false);
    expect(validFootballPredictionArithmetic(prediction({ total: 61 }))).toBe(false);
  });

  it("checks available relationships while permitting a partial live refresh", () => {
    expect(validFootballPredictionArithmetic(prediction({ home_score: null }))).toBe(true);
    expect(validFootballPredictionArithmetic(prediction({ home_score: -1 }))).toBe(false);
  });
});

