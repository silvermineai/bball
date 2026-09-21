import { describe, expect, it } from "vitest";
import { lowerForecastCsvRows, lowerForecastsForDivision, lowerForecastUncertainty, lowerResultsForDivision, validateLowerFootballResults } from "./football-lower-results";

const row = (division: "d2" | "d3", score_complete = true) => ({
  game_id: `${division}-1`, kickoff: "2026-09-01T00:00:00Z", week: 1,
  scope_division: division, home_id: `${division}-home`, home_name: "Home", home_division: division,
  away_id: `${division}-away`, away_name: "Away", away_division: division,
  home_score: score_complete ? 21 : null, away_score: score_complete ? 14 : null,
  neutral: false, score_complete,
});

const forecast = (division: "d2" | "d3", game_id: string, kickoff: string, home_win_probability: number, margin_low: number, margin_high: number) => ({
  game_id, kickoff, week: 1, scope_division: division,
  home_id: `${division}-home`, home_name: `${division} Home`,
  away_id: `${division}-away`, away_name: `${division} Away`, neutral: false,
  model_id: `model-${division}`,
  prediction: {
    home_margin: 3, total: 48, home_score: 26, away_score: 22,
    home_win_probability, margin_low, margin_high,
  },
});

describe("lower-division football results", () => {
  it("keeps D2 and D3 cohorts separate and recomputes coverage", () => {
    const archive = validateLowerFootballResults({
      schema_version: 1, sport: "football", season: 2026, generated_at: "now", rows: [row("d2"), row("d3"), row("d2", false), { bad: true }],
      teams: { d2: [], d3: [] }, limitations: [],
    });
    expect(lowerResultsForDivision(archive, "d2")).toHaveLength(2);
    expect(lowerResultsForDivision(archive, "d3")).toHaveLength(1);
    expect(archive.coverage.d2).toEqual({ games: 2, score_complete: 1, scores_missing: 1, upcoming_games: 0, forecast_games: 0 });
    expect(archive.coverage.d3).toEqual({ games: 1, score_complete: 1, scores_missing: 0, upcoming_games: 0, forecast_games: 0 });
  });

  it("fails closed for an unsupported archive edition", () => {
    expect(() => validateLowerFootballResults({ sport: "basketball", schema_version: 1, season: 2026 })).toThrow("unsupported edition");
  });

  it("filters and orders only the requested exact-division forecast cohort", () => {
    const archive = validateLowerFootballResults({
      schema_version: 2, sport: "football", season: 2026, generated_at: "now", rows: [],
      teams: { d2: [], d3: [] }, limitations: [],
      forecasts: {
        d2: [forecast("d2", "d2-late", "2026-09-03T00:00:00Z", 0.9, -20, 30), forecast("d2", "d2-early", "2026-09-01T00:00:00Z", 0.4, -5, 9)],
        d3: [forecast("d3", "d3-only", "2026-09-01T00:00:00Z", 0.99, -2, 2)],
      },
    });
    expect(lowerForecastsForDivision(archive, "d2").map((item) => item.game_id)).toEqual(["d2-early", "d2-late"]);
    expect(lowerForecastsForDivision(archive, "d2", "late").map((item) => item.game_id)).toEqual(["d2-late"]);
    expect(lowerForecastsForDivision(archive, "d2", "", "home_win_probability").map((item) => item.game_id)).toEqual(["d2-late", "d2-early"]);
    expect(lowerForecastsForDivision(archive, "d2", "", "uncertainty").map((item) => item.game_id)).toEqual(["d2-early", "d2-late"]);
    expect(lowerForecastsForDivision(archive, "d3").map((item) => item.game_id)).toEqual(["d3-only"]);
  });

  it("exports the published interval width alongside each forecast", () => {
    const item = forecast("d2", "d2-1", "2026-09-01T00:00:00Z", 0.6, -10, 14);
    expect(lowerForecastUncertainty(item)).toBe(24);
    expect(lowerForecastCsvRows([item])[0]).toEqual([
      "d2", "d2-1", "2026-09-01T00:00:00Z", "d2 Away", "d2 Home", "home field", "model-d2",
      22, 26, 48, 3, 0.6, -10, 14, 24,
    ]);
  });
});
