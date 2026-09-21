import { describe, expect, it } from "vitest";
import { footballForecastEvidence, footballForecastDivision } from "./football-forecast-evidence";

const model = {
  teams: ["away", "home"],
  margin_coef: [2, 3, 5, 4],
  total_coef: [40, 1, 20, 10],
};

const game = (overrides: Record<string, unknown> = {}) => ({
  home_id: "home",
  away_id: "away",
  home_division: "FBS",
  away_division: "FCS",
  neutral: 0,
  prediction: {
    home_margin: 4,
    total: 71,
    home_score: 37.5,
    away_score: 33.5,
    home_win_probability: 0.64,
    margin_low: -10,
    margin_high: 22,
    model_id: "model-1",
  },
  ...overrides,
});

describe("football forecast evidence", () => {
  it("normalizes FBS/FCS into the exact D1 scope", () => {
    expect(footballForecastDivision(" Division II ")).toBe("d2");
    expect(footballForecastEvidence(game(), model, "model-1")).toMatchObject({
      state: "verified",
      division: "d1",
      reasons: [],
      reconstruction: { margin_delta: 0, total_delta: 0, score_margin_delta: 0, score_total_delta: 0 },
    });
  });

  it("withholds verification for mixed divisions, stale editions, and bad arithmetic", () => {
    expect(footballForecastEvidence(game({ home_division: "D2", away_division: "D3" }), model, "model-1").reasons).toContain("mixed or unknown division");
    expect(footballForecastEvidence(game({ prediction: { ...game().prediction, model_id: "old" } }), model, "model-1").reasons).toContain("model edition mismatch");
    expect(footballForecastEvidence(game({ prediction: { ...game().prediction, total: 90 } }), model, "model-1")).toMatchObject({ state: "review" });
  });

  it("keeps absent forecasts unavailable instead of treating them as zero", () => {
    expect(footballForecastEvidence(game({ prediction: null }), model, "model-1")).toEqual({
      state: "unavailable",
      division: "d1",
      reasons: ["no published forecast"],
      reconstruction: null,
    });
  });
});
