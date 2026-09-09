import { describe, expect, it } from "vitest";
import type { BBGame } from "./basketball-types";
import { basketballEditorialLens } from "./basketball-editorial";

const game = (margin: number, low: number, high: number, edges?: BBGame["matchup_factors"]): BBGame => ({
  id: "1",
  season: 2027,
  starts_at: "2026-11-01T00:00:00Z",
  home_id: "home",
  away_id: "away",
  home_name: "Home",
  away_name: "Away",
  neutral: 0,
  time_tbd: 0,
  venue: "",
  broadcast: "",
  prediction: {
    home_score: 76,
    away_score: 70,
    home_margin: margin,
    total: 146,
    pace: 68,
    home_win_probability: 0.7,
    margin_low: low,
    margin_high: high,
  },
  matchup_factors: edges,
});

describe("basketball editorial lens", () => {
  it("opens close games with a one-possession prompt", () => {
    expect(basketballEditorialLens(game(2.4, -12, 16))?.title).toBe("A one-possession question");
  });

  it("prioritizes the strongest adjusted factor when the range is narrower", () => {
    const lens = basketballEditorialLens(game(9, -2, 20, {
      season: 2026,
      factors: {},
      edges: { efg: 0.031, orb: -0.01 },
    }));
    expect(lens?.title).toBe("Home owns the shot-making edge");
    expect(lens?.body).toContain("3.1 percentage points");
  });

  it("does not create an angle without a forecast", () => {
    const unforecasted = { ...game(0, -10, 10), prediction: null, fallback_prediction: null };
    expect(basketballEditorialLens(unforecasted)).toBeNull();
  });
});
