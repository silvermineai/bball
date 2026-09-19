import { describe, expect, it } from "vitest";
import type { Game } from "../_lib/data";
import { footballForecastCsvRows } from "./LiveFootballDashboardForecastTable";

const game: Game = {
  id: "g1",
  season: 2026,
  kickoff: "2026-09-12T16:00:00Z",
  home_id: "home",
  away_id: "away",
  home_name: "Home",
  away_name: "Away",
  home_conference: "Home Conf",
  away_conference: "Away Conf",
  home_division: "fbs",
  away_division: "fbs",
  week: 2,
  neutral: 0,
  venue: "Stadium",
  time_tbd: 0,
  prediction: {
    home_margin: 4,
    total: 48,
    home_score: 26,
    away_score: 22,
    home_win_probability: 0.62,
    margin_low: -8,
    margin_high: 16,
  },
  market: null,
};

describe("football forecast board export", () => {
  it("exports model fields and verified market gaps for the full filtered cohort", () => {
    const rows = footballForecastCsvRows([game], {
      g1: [{
        provider: "licensed",
        bookmaker: "book",
        market: "spreads",
        line: -3.5,
        model_difference: 7.5,
        captured_at: "2026-09-10T12:00:00Z",
        updated_at: "2026-09-10T12:00:00Z",
        market_home_probability: null,
      }],
    });
    expect(rows[0].slice(0, 16)).toEqual([
      "g1", "2026-09-12T16:00:00Z", 2, "Away", "Home", "Away Conf", "Home Conf", "no", "no", 22, 26,
      62, 4, -8, 16, 48,
    ]);
    expect(rows[0].slice(16)).toEqual([-3.5, null, 7.5, null, "2026-09-10T12:00:00Z", null, null]);
  });
});
