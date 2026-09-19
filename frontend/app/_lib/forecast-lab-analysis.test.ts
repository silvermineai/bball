import { describe, expect, it } from "vitest";
import type { BBGame, BBMatchupFactors } from "./basketball-types";
import { compactMatchupSignals, forecastEvidenceCoverage, forecastEvidenceDetail, forecastEvidenceLabel, forecastSignalContext, forecastUnknownTeams, strongestMatchupSignal } from "./forecast-lab-analysis";

const factors: BBMatchupFactors = {
  season: 2026,
  factors: {},
  edges: { efg: 0.021, tov: -0.034, orb: 0.034, ftr: Number.NaN },
};

describe("forecast lab matchup signals", () => {
  it("labels primary probability strength without turning it into a recommendation", () => {
    expect(forecastSignalContext({
      home_win_probability: 0.78,
      margin_low: -4.25,
      margin_high: 12.75,
    } as BBGame["prediction"], true)).toEqual({
      estimate: "primary",
      label: "Strong signal",
      probability_edge_pp: 28,
      range_width: 17,
    });
    expect(forecastSignalContext({
      home_win_probability: 0.56,
      margin_low: -8,
      margin_high: 8,
    } as BBGame["prediction"], true).label).toBe("Near even");
  });

  it("keeps cold-start and malformed estimates visibly separate", () => {
    expect(forecastSignalContext({
      home_win_probability: 0.82,
      margin_low: -25,
      margin_high: 25,
      estimate_type: "cold_start",
    } as BBGame["prediction"], false)).toMatchObject({
      estimate: "cold-start",
      label: "Cold-start estimate",
      probability_edge_pp: 32,
      range_width: 50,
    });
    expect(forecastSignalContext({
      home_win_probability: Number.NaN,
      margin_low: -5,
      margin_high: 5,
    } as BBGame["prediction"], true)).toEqual({
      estimate: "unavailable",
      label: "Unavailable",
      probability_edge_pp: null,
      range_width: null,
    });
    expect(forecastSignalContext({
      home_win_probability: 0.62,
      margin_low: 8,
      margin_high: -8,
    } as BBGame["prediction"], true)).toMatchObject({
      label: "Unavailable",
      range_width: null,
    });
  });

  it("keeps the exact cold-start reason while rejecting duplicate or malformed names", () => {
    expect(forecastUnknownTeams({
      away_score: 70,
      home_score: 70,
      home_margin: 0,
      total: 140,
      pace: 68,
      home_win_probability: 0.5,
      margin_low: -20,
      margin_high: 20,
      estimate_type: "cold_start",
      unknown_teams: ["  North Alabama ", "North Alabama", "", "  "],
    })).toEqual(["North Alabama"]);
    expect(forecastUnknownTeams({
      away_score: 70,
      home_score: 70,
      home_margin: 0,
      total: 140,
      pace: 68,
      home_win_probability: 0.5,
      margin_low: -20,
      margin_high: 20,
      unknown_teams: ["Primary team"],
    })).toEqual([]);
  });

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

  it("reports exact matchup evidence gaps without treating an absent market as model failure", () => {
    expect(forecastEvidenceCoverage({
      primary: true,
      scheduled: false,
      factors: true,
      roster: false,
      market: false,
    })).toEqual({
      present: 2,
      total: 4,
      missing: ["confirmed tip time", "roster continuity scenario"],
      complete: false,
      market: "unavailable",
    });
  });

  it("marks a complete core brief while retaining verified market lineage", () => {
    const evidence = forecastEvidenceCoverage({
      primary: true,
      scheduled: true,
      factors: true,
      roster: true,
      market: true,
    });
    expect(evidence).toMatchObject({ present: 4, total: 4, missing: [], complete: true, market: "verified" });
    expect(forecastEvidenceLabel(evidence)).toBe("Core packet + market");
    expect(forecastEvidenceDetail(evidence)).toContain("qualifying pregame market quote is attached");
  });

  it("surfaces the schedule and market gaps on an upcoming game", () => {
    const evidence = forecastEvidenceCoverage({
      primary: true,
      scheduled: false,
      factors: true,
      roster: true,
      market: false,
    });
    expect(forecastEvidenceLabel(evidence)).toBe("3/4 core evidence");
    expect(forecastEvidenceDetail(evidence)).toBe("Missing: confirmed tip time. No qualifying pregame market quote is attached; no market edge is inferred.");
  });
});
