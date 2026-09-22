import { describe, expect, it } from "vitest";
import { footballForecastReadiness } from "./football-forecast-readiness";
import type { Game } from "./data";

const game = (overrides: Partial<Game> = {}): Game => ({
  id: "g1",
  season: 2026,
  kickoff: "2026-09-01T19:00:00Z",
  home_id: "h",
  away_id: "a",
  home_name: "Home",
  away_name: "Away",
  home_conference: "X",
  away_conference: "Y",
  home_division: "FBS",
  away_division: "FCS",
  week: 1,
  neutral: 0,
  venue: "Stadium",
  time_tbd: 0,
  prediction: null,
  market: null,
  ...overrides,
});

const prediction = (model_id?: string) => ({
  home_margin: 4,
  total: 48,
  home_score: 26,
  away_score: 22,
  home_win_probability: 0.62,
  margin_low: -5,
  margin_high: 13,
  model_id,
});

describe("football forecast readiness", () => {
  it("reconciles forecast, missing and market-linked rows by exact division", () => {
    const result = footballForecastReadiness([
      game({ id: "d1-forecast", prediction: prediction("model-1") }),
      game({ id: "d1-missing", prediction: null, home_division: "Division I", away_division: "Division I" }),
      game({ id: "d2-market", prediction: prediction("model-1"), home_division: "D2", away_division: "Division II" }),
    ], new Set(["d2-market"]));
    expect(result.rows).toEqual([
      { division: "d1", scheduled: 2, forecasted: 1, missing_forecast: 1, unlabeled_forecast: 0, market_linked: 0 },
      { division: "d2", scheduled: 1, forecasted: 1, missing_forecast: 0, unlabeled_forecast: 0, market_linked: 1 },
      { division: "d3", scheduled: 0, forecasted: 0, missing_forecast: 0, unlabeled_forecast: 0, market_linked: 0 },
    ]);
    expect(result.total_scheduled).toBe(3);
    expect(result.total_forecasted).toBe(2);
  });

  it("fails closed for malformed forecasts and mixed division labels", () => {
    const result = footballForecastReadiness([
      game({ id: "bad", prediction: { ...prediction("model-1"), home_win_probability: 1.4 } }),
      game({ id: "mixed", home_division: "D2", away_division: "D3", prediction: prediction("model-1") }),
      game({ id: "unlabeled", home_division: "D3", away_division: "D3", prediction: prediction() }),
    ]);
    expect(result.rows.find((row) => row.division === "d1")).toMatchObject({ scheduled: 1, forecasted: 0, missing_forecast: 1 });
    expect(result.invalid_forecasts).toBe(1);
    expect(result.mixed_division_games).toBe(1);
    expect(result.rows.find((row) => row.division === "d3")).toMatchObject({ forecasted: 1, unlabeled_forecast: 1 });
  });

  it("withholds a forecast whose projected score arithmetic is contradictory", () => {
    const result = footballForecastReadiness([
      game({
        home_division: "D1",
        away_division: "D1",
        prediction: { ...prediction("model-1"), home_margin: 12 },
      }),
    ]);
    expect(result.rows.find((row) => row.division === "d1")).toMatchObject({
      scheduled: 1,
      forecasted: 0,
      missing_forecast: 1,
    });
    expect(result.invalid_forecasts).toBe(1);
  });
});
