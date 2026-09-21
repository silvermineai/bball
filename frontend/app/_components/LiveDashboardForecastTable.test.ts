import { describe, expect, it } from "vitest";
import { forecastCsvRows, matchupFactorContextLabel, matchesEstimateFilter, matchupFactorEdges, sortForecastBoard, strongestFactorEdge, tipStatus } from "./LiveDashboardForecastTable";
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

describe("matchupFactorContextLabel", () => {
  it("labels the retained context season instead of implying it is current-season data", () => {
    expect(matchupFactorContextLabel({
      ...games[0],
      matchup_factors: { season: 2026, factors: {}, edges: {} },
    })).toBe("Four Factor context · 2026");
    expect(matchupFactorContextLabel({
      ...games[0],
      matchup_factors: { season: 2026, factors: {}, edges: {} },
      matchup_factors_model_id: "model-old",
      matchup_factors_same_edition: false,
    })).toBe("Other-edition context · model-old · 2026");
    expect(matchupFactorContextLabel(games[0])).toBe("Four Factor context unavailable");
  });
});

describe("forecastCsvRows", () => {
  it("exports model and matchup evidence without dropping unavailable fields", () => {
    const rows = forecastCsvRows([{
      ...games[0],
      fallback_prediction: { ...games[0].prediction!, estimate_type: "cold_start" as const },
      matchup_factors: { season: 2026, factors: {}, edges: { efg: 0.012, tov: -0.031, orb: 0.018, ftr: 0 } },
    }]);
    expect(rows[0].slice(0, 8)).toEqual(["late", "2026-11-10T04:00:00Z", "Away late", "Home late", "primary", 70, 75, 0.58]);
    expect(rows[0].slice(15, 19)).toEqual([0.012, -0.031, 0.018, 0]);
    expect(rows[0].slice(19, 22)).toEqual([null, null, 2027]);
    expect(rows[0][22]).toBeNull();
  });

  it("keeps the exact forecast edition and row clock alongside descriptive factor provenance", () => {
    const rows = forecastCsvRows([{
      ...games[0],
      forecast_model_id: "basketball-efficiency-v2-current",
      forecast_created_at: "2026-09-17T10:24:29.481035Z",
      matchup_factors_model_id: "basketball-efficiency-v2-factor",
    }], {}, [], [], "basketball-efficiency-v2-fallback");
    expect(rows[0].slice(19, 25)).toEqual([
      "basketball-efficiency-v2-current",
      "2026-09-17T10:24:29.481035Z",
      2027,
      "basketball-efficiency-v2-factor",
      null,
      null,
    ]);
  });

  it("exports the adjusted team ratings used to read the matchup", () => {
    const rows = forecastCsvRows([games[0]], {}, [], [
      { id: games[0].home_id, name: "Home", rank: 1, adj_off: 116.2, adj_def: 94.4, adj_net: 21.8, adj_tempo: 68.1, games: 30, wins: 25, expected_wins: null, luck: null, luck_games: 30, sos: 4.2, sos_games: 30, efg: null, tov_rate: null, orb_rate: null, ft_rate: null, three_rate: null },
      { id: games[0].away_id, name: "Away", rank: 2, adj_off: 108.4, adj_def: 99.1, adj_net: 9.3, adj_tempo: 65.7, games: 30, wins: 20, expected_wins: null, luck: null, luck_games: 30, sos: 1.1, sos_games: 30, efg: null, tov_rate: null, orb_rate: null, ft_rate: null, three_rate: null },
    ]);
    expect(rows[0].slice(-10, -2)).toEqual([116.2, 94.4, 21.8, 68.1, 108.4, 99.1, 9.3, 65.7]);
  });
});
