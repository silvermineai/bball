import { describe, expect, it } from "vitest";
import type { BBGame, BBMatchupFactors } from "./basketball-types";
import { compactMatchupSignals, strongestMatchupSignal } from "./forecast-lab-analysis";

const factors: BBMatchupFactors = {
  season: 2026,
  factors: {},
  edges: { efg: 0.021, tov: -0.034, orb: 0.034, ftr: Number.NaN },
};

describe("forecast lab matchup signals", () => {
  it("selects the largest finite factor gap with stable tie ordering", () => {
    expect(strongestMatchupSignal(factors)).toEqual({
      factor: "tov",
      label: "Ball security",
      edge: -0.034,
      season: 2026,
    });
  });

  it("returns null when no factor evidence is available", () => {
    expect(strongestMatchupSignal(null)).toBeNull();
    expect(strongestMatchupSignal({ season: 2026, factors: {}, edges: {} })).toBeNull();
  });

  it("builds a compact exact-game-ID lookup", () => {
    const games = [
      { id: "game-a", matchup_factors: factors },
      { id: "game-b", matchup_factors: null },
    ] as BBGame[];
    expect(compactMatchupSignals(games)).toEqual({
      "game-a": { factor: "tov", label: "Ball security", edge: -0.034, season: 2026 },
    });
  });
});
