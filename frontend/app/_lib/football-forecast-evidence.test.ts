import { describe, expect, it } from "vitest";
import { footballForecastAvailability, footballForecastEvidence, footballForecastDivision } from "./football-forecast-evidence";

const model = {
  teams: ["away", "home"],
  margin_coef: [2, 3, 5, 4],
  total_coef: [40, 1, 20, 10],
};

const game = (overrides: Record<string, unknown> = {}) => ({
  home_id: "home",
  away_id: "away",
  home_name: "Home",
  away_name: "Away",
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

describe("football forecast availability", () => {
  it("distinguishes an unseen D1 team from lower-division scope", () => {
    expect(footballForecastAvailability({ ...game({ prediction: null }), home_name: "Known", away_name: "New Team", away_id: "new" }, ["home"])).toMatchObject({
      state: "unseen_team",
      label: "Model coverage gap",
    });
    expect(footballForecastAvailability(game({ prediction: null, home_division: "D2", away_division: "D2" }), ["home", "away"])).toMatchObject({
      state: "out_of_scope",
      label: "Outside primary model scope",
    });
  });

  it("keeps mixed divisions and missing rows explicitly unavailable", () => {
    expect(footballForecastAvailability(game({ prediction: null, home_division: "FBS", away_division: "unknown" }), ["home", "away"]).state).toBe("division_unavailable");
    expect(footballForecastAvailability(game({ prediction: null }), ["home", "away"])).toMatchObject({
      state: "missing",
      detail: expect.stringContaining("Both teams are in the trained field"),
    });
    expect(footballForecastAvailability(game()).state).toBe("forecasted");
  });
});
