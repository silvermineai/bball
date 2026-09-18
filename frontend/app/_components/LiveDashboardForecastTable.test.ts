import { describe, expect, it } from "vitest";
import { matchesEstimateFilter, matchupFactorEdges, sortForecastBoard, strongestFactorEdge, tipStatus } from "./LiveDashboardForecastTable";
import type { BBGame } from "../_lib/basketball-types";

const game = (id: string, starts_at: string, home_margin: number, home_win_probability: number): BBGame => ({
  id,
  season: 2027,
  starts_at,
  home_id: `home-${id}`,
  away_id: `away-${id}`,
  home_name: `Home ${id}`,
  away_name: `Away ${id}`,
  neutral: 0,
  time_tbd: 0,
  venue: "",
  broadcast: "",
  prediction: {
    home_score: 75,
    away_score: 70,
    home_margin,
    total: 145,
    pace: 68,
    home_win_probability,
    margin_low: home_margin - 8,
    margin_high: home_margin + 8,
  },
});

const games = [
  game("late", "2026-11-10T04:00:00Z", 3, 0.58),
  game("early", "2026-11-01T04:00:00Z", 12, 0.91),
  game("middle", "2026-11-05T04:00:00Z", -8, 0.75),
];

describe("sortForecastBoard", () => {

  it("orders by tip time by default", () => {
    expect(sortForecastBoard(games, "start").map((row) => row.id)).toEqual(["early", "middle", "late"]);
  });

  it("orders confidence and absolute margin from highest to lowest", () => {
    expect(sortForecastBoard(games, "confidence").map((row) => row.id)).toEqual(["early", "middle", "late"]);
    expect(sortForecastBoard(games, "margin").map((row) => row.id)).toEqual(["early", "middle", "late"]);
  });
});

describe("matchesEstimateFilter", () => {
  it("separates primary and cold-start estimates without dropping either from all", () => {
    const coldStart = { ...games[0], prediction: null, fallback_prediction: { ...games[0].prediction!, estimate_type: "cold_start" as const } };
    expect(games.filter((row) => matchesEstimateFilter(row, "primary")).map((row) => row.id)).toEqual(["late", "early", "middle"]);
    expect(matchesEstimateFilter(coldStart, "primary")).toBe(false);
    expect(matchesEstimateFilter(coldStart, "cold-start")).toBe(true);
    expect(matchesEstimateFilter(coldStart, "all")).toBe(true);
  });
});

describe("tipStatus", () => {
  it("distinguishes confirmed, scheduled and TBD clocks", () => {
    expect(tipStatus(games[0])).toBe("Scheduled time");
    expect(tipStatus({ ...games[0], time_tbd: 1 })).toBe("Time TBD");
    expect(tipStatus({ ...games[0], source_time_valid: true, source_start: "2026-11-10T04:00:00Z" })).toBe("Source-confirmed start");
  });
});

describe("strongestFactorEdge", () => {
  it("returns the largest matchup factor edge with its favored side", () => {
    expect(strongestFactorEdge({
      ...games[0],
      matchup_factors: {
        season: 2026,
        factors: {},
        edges: { efg: 0.012, tov: -0.031, orb: 0.018, ftr: 0 },
      },
    })).toBe("A TO 3.1");
  });

  it("returns null when the matchup has no factor edge", () => {
    expect(strongestFactorEdge(games[0])).toBeNull();
  });
});

describe("matchupFactorEdges", () => {
  it("keeps every finite four-factor edge in the published order", () => {
    expect(matchupFactorEdges({
      ...games[0],
      matchup_factors: {
        season: 2026,
        factors: {},
        edges: { efg: 0.012, tov: undefined, orb: -0.018, ftr: 0 },
      },
    })).toEqual([
      { key: "efg", value: 0.012 },
      { key: "orb", value: -0.018 },
      { key: "ftr", value: 0 },
    ]);
  });
});
