import { describe, expect, it } from "vitest";
import {
  matchesFootballMatchupSignal,
  parseFootballMatchupSignal,
} from "./football-matchup-view";

const prediction = (probability: number) => ({
  home_margin: 1,
  total: 50,
  home_score: 26,
  away_score: 24,
  home_win_probability: probability,
  margin_low: -10,
  margin_high: 12,
});

describe("football matchup signal filters", () => {
  it("accepts supported values and fails closed", () => {
    expect(parseFootballMatchupSignal("strong")).toBe("strong");
    expect(parseFootballMatchupSignal("wild")).toBe("all");
    expect(parseFootballMatchupSignal(null)).toBe("all");
  });

  it("uses the shared confidence boundaries", () => {
    expect(matchesFootballMatchupSignal(prediction(0.59), "toss-up")).toBe(true);
    expect(matchesFootballMatchupSignal(prediction(0.6), "lean")).toBe(true);
    expect(matchesFootballMatchupSignal(prediction(0.75), "strong")).toBe(true);
    expect(matchesFootballMatchupSignal(prediction(0.75), "lean")).toBe(false);
    expect(matchesFootballMatchupSignal(null, "strong")).toBe(false);
  });
});
