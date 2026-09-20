import { describe, expect, it } from "vitest";
import { footballModelFactors } from "./football-model-factors";

const model = {
  teams: ["away", "home", "other"],
  margin_coef: [2, 3, 4, 5, 6],
  total_coef: [40, 1, 10, 20, 30],
};

describe("football model factor decomposition", () => {
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
