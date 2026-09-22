import { describe, expect, it } from "vitest";
import { explainBasketballPrediction, publishedScoreArithmetic } from "./basketball-prediction-explanation";

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

  it("reconciles a live row from its published efficiency and pace fields", () => {
    const explanation = publishedScoreArithmetic({
      home_score: 76.98,
      away_score: 59.33,
      home_efficiency: 116.52,
      away_efficiency: 89.8,
      pace: 66.07,
    });
    expect(explanation).toMatchObject({ pace: 66.07, homeEfficiency: 116.52, awayEfficiency: 89.8 });
    expect(explanation?.homeScore).toBeCloseTo(76.98, 1);
    expect(explanation?.awayScore).toBeCloseTo(59.33, 1);
  });

  it("withholds arithmetic when efficiency fields do not reconcile", () => {
    expect(publishedScoreArithmetic({
      home_score: 80,
      away_score: 65,
      home_efficiency: 100,
      away_efficiency: 90,
      pace: 70,
    })).toBeNull();
  });
});
