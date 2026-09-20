import { describe, expect, it } from "vitest";
import { explainBasketballPrediction } from "./basketball-prediction-explanation";

const model = {
  teams: ["away", "home"],
  efficiency: [100, 4, 5, -2, -3, 1],
  tempo: [70, 1, -2],
};
const game = { home_id: "home", away_id: "away", home_name: "Home", away_name: "Away", neutral: 0 } as const;

describe("explainBasketballPrediction", () => {
  it("reconstructs the published score from the coefficient terms", () => {
    const explanation = explainBasketballPrediction(model, game, {
      home_score: 66.93,
      away_score: 71.76,
      pace: 69,
    });
    expect(explanation?.paceBaseline).toBe(69);
    expect(explanation?.home).toMatchObject({ league: 100, ownOffense: -2, opponentDefense: -3, venue: 2, efficiency: 97.0 });
    expect(explanation?.away).toMatchObject({ ownOffense: 5, opponentDefense: 1, venue: -2, efficiency: 104 });
    expect(explanation?.home.projectedScore).toBeCloseTo(66.93, 2);
    expect(explanation?.away.projectedScore).toBeCloseTo(71.76, 2);
  });

  it("removes venue from both sides at a neutral site", () => {
    const explanation = explainBasketballPrediction(model, { ...game, neutral: 1 }, { home_score: 65.55, away_score: 73.14, pace: 69 });
    expect(explanation?.home.venue).toBe(0);
    expect(explanation?.away.venue).toBe(0);
  });

  it("withholds a stale or malformed explanation", () => {
    expect(explainBasketballPrediction(model, game, { home_score: 80, away_score: 65.8, pace: 69 })).toBeNull();
    expect(explainBasketballPrediction({ ...model, teams: ["away"] }, game, { home_score: 66.93, away_score: 71.76, pace: 69 })).toBeNull();
  });
});
