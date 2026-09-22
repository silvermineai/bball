import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lowerDivisionSelection, lowerForecastCsvRows, lowerForecastExplanation, lowerForecastsForDivision, lowerForecastUncertainty, lowerResultsForDivision, validateLowerFootballResults } from "./football-lower-results";

const row = (division: "fcs" | "d2" | "d3", score_complete = true) => ({
  game_id: `${division}-1`, kickoff: "2026-09-01T00:00:00Z", week: 1,
  scope_division: division, home_id: `${division}-home`, home_name: "Home", home_division: division,
  away_id: `${division}-away`, away_name: "Away", away_division: division,
  home_score: score_complete ? 21 : null, away_score: score_complete ? 14 : null,
  neutral: false, score_complete,
});

const forecast = (division: "fcs" | "d2" | "d3", game_id: string, kickoff: string, home_win_probability: number, margin_low: number, margin_high: number) => ({
  game_id, kickoff, week: 1, scope_division: division,
  home_id: `${division}-home`, home_name: `${division} Home`,
  away_id: `${division}-away`, away_name: `${division} Away`, neutral: false,
  model_id: `model-${division}`,
  prediction: {
    home_margin: 4, total: 48, home_score: 26, away_score: 22,
    home_win_probability, margin_low, margin_high,
  },
});

const model = (division: "fcs" | "d2" | "d3", ratings = [
  { team_id: `${division}-home`, team: "Home", division, rating: 4, rank: 1 },
  { team_id: `${division}-away`, team: "Away", division, rating: -2, rank: 2 },
]) => ({
  id: `model-${division}`, version: "ridge", division, target_season: 2026,
  cutoff: "2026-09-21T00:00:00Z", training_seasons: [2022, 2023, 2024],
  training_games: 300, calibration_season: 2024,
  calibration: { games: 100, margin_half_width: 20 }, limitations: [], ratings,
});

describe("lower-division football results", () => {
  it("keeps D2 and D3 cohorts separate and recomputes coverage", () => {
    const archive = validateLowerFootballResults({
      schema_version: 1, sport: "football", season: 2026, generated_at: "now", rows: [row("d2"), row("d3"), { ...row("d2", false), game_id: "d2-2" }],
      teams: { d2: [], d3: [] }, limitations: [],
    });
    expect(lowerResultsForDivision(archive, "d2")).toHaveLength(2);
    expect(lowerResultsForDivision(archive, "d3")).toHaveLength(1);
    expect(archive.coverage.d2).toEqual({ games: 2, score_complete: 1, scores_missing: 1, upcoming_games: 0, forecast_games: 0 });
    expect(archive.coverage.d3).toEqual({ games: 1, score_complete: 1, scores_missing: 0, upcoming_games: 0, forecast_games: 0 });
  });

  it("fails closed instead of dropping a malformed schedule row", () => {
    expect(() => validateLowerFootballResults({
      schema_version: 1, sport: "football", season: 2026, generated_at: "now",
      rows: [row("d2"), { bad: true }], teams: { d2: [], d3: [] }, limitations: [],
    })).toThrow("malformed schedule row at index 1");
  });

  it("accepts the checked-in exact-division 2026 release", () => {
    const release = JSON.parse(readFileSync("public/data/football/lower-division-results-2026.json", "utf8")) as unknown;
    const archive = validateLowerFootballResults(release);
    expect(archive.coverage.d2.forecast_games).toBe(570);
    expect(archive.coverage.d3.forecast_games).toBe(842);
    expect(archive.forecasts.d2.every((item) => item.scope_division === "d2")).toBe(true);
    expect(archive.forecasts.d3.every((item) => item.scope_division === "d3")).toBe(true);
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

  it("fails closed when a forecast crosses its keyed division", () => {
    expect(() => validateLowerFootballResults({
      schema_version: 2, sport: "football", season: 2026, generated_at: "now", rows: [],
      teams: { d2: [], d3: [] }, limitations: [],
      forecasts: {
        d2: [forecast("d3", "miskeyed-d3", "2026-09-01T00:00:00Z", 0.5, -10, 10)],
        d3: [forecast("d3", "valid-d3", "2026-09-01T00:00:00Z", 0.5, -10, 10)],
      },
    })).toThrow("malformed d2 forecast row at index 0");
  });

  it("exports the published interval width alongside each forecast", () => {
    const item = forecast("d2", "d2-1", "2026-09-01T00:00:00Z", 0.6, -10, 14);
    expect(lowerForecastUncertainty(item)).toBe(24);
    expect(lowerForecastCsvRows([item])[0]).toEqual([
      "d2", "d2-1", "2026-09-01T00:00:00Z", "d2 Away", "d2 Home", "home field", "model-d2",
      22, 26, 48, 4, 0.6, -10, 14, 24,
    ]);
  });

  it("explains a forecast with the retained exact-division rating gap and venue", () => {
    const item = forecast("d2", "d2-1", "2026-09-01T00:00:00Z", 0.6, -10, 14);
    const model = {
      id: "model-d2", version: "ridge", division: "d2" as const, target_season: 2026,
      cutoff: "2026-09-21T00:00:00Z", training_seasons: [2022, 2023, 2024], training_games: 300,
      calibration_season: 2024, calibration: { games: 100, margin_half_width: 20 }, limitations: [],
      ratings: [
        { team_id: "d2-home", team: "Home", division: "d2" as const, rating: 4.25, rank: 1 },
        { team_id: "d2-away", team: "Away", division: "d2" as const, rating: -1.5, rank: 2 },
      ],
    };
    expect(lowerForecastExplanation(item, model)).toEqual({
      home_rating: 4.25,
      away_rating: -1.5,
      rating_gap: 5.75,
      venue: "home_field",
    });
    expect(lowerForecastExplanation({ ...item, neutral: true }, model).venue).toBe("neutral");
  });

  it("keeps rating evidence unavailable for an unseen team", () => {
    const item = forecast("d3", "d3-1", "2026-09-01T00:00:00Z", 0.6, -10, 14);
    const explanation = lowerForecastExplanation(item, null);
    expect(explanation.rating_gap).toBeNull();
    expect(explanation.venue).toBe("home_field");
  });

  it("supports the availability page selecting the requested D3 scope", () => {
    const archive = validateLowerFootballResults({
      schema_version: 2, sport: "football", season: 2026, generated_at: "now", rows: [],
      teams: { d2: [], d3: [] }, limitations: [],
      forecasts: { d2: [forecast("d2", "d2-only", "2026-09-01T00:00:00Z", 0.5, -10, 10)], d3: [forecast("d3", "d3-only", "2026-09-01T00:00:00Z", 0.5, -10, 10)] },
    });
    expect(lowerForecastsForDivision(archive, "d3").map((item) => item.game_id)).toEqual(["d3-only"]);
    expect(lowerDivisionSelection("d3")).toBe("d3");
    expect(lowerDivisionSelection(undefined)).toBe("d2");
  });

  it("keeps the exact-FCS model cohort available beside D2 and D3", () => {
    const archive = validateLowerFootballResults({
      schema_version: 2, sport: "football", season: 2026, generated_at: "now", rows: [row("fcs")],
      teams: { fcs: [], d2: [], d3: [] }, limitations: [],
      forecasts: { fcs: [forecast("fcs", "fcs-only", "2026-09-01T00:00:00Z", 0.7, -8, 12)], d2: [], d3: [] },
    });
    expect(lowerResultsForDivision(archive, "fcs")).toHaveLength(1);
    expect(lowerForecastsForDivision(archive, "fcs").map((item) => item.game_id)).toEqual(["fcs-only"]);
    expect(lowerDivisionSelection("fcs")).toBe("fcs");
  });

  it("rejects a division model with duplicate rating identities or malformed rows", () => {
    const duplicateRank = model("d2", [
      { team_id: "d2-home", team: "Home", division: "d2", rating: 4, rank: 1 },
      { team_id: "d2-away", team: "Away", division: "d2", rating: -2, rank: 1 },
    ]);
    const malformedRow = model("d3", [
      { team_id: "d3-home", team: "Home", division: "d3", rating: 4, rank: 1 },
      { team_id: "d3-away", team: "Away", division: "d3", rating: -2, rank: 0 },
    ]);
    const archive = validateLowerFootballResults({
      schema_version: 2, sport: "football", season: 2026, generated_at: "now",
      rows: [], teams: { fcs: [], d2: [], d3: [] }, limitations: [],
      models: { d2: duplicateRank, d3: malformedRow },
    });
    expect(archive.models.d2).toBeUndefined();
    expect(archive.models.d3).toBeUndefined();
  });

  it("rejects a model from a different target season", () => {
    const archive = validateLowerFootballResults({
      schema_version: 2, sport: "football", season: 2026, generated_at: "now",
      rows: [], teams: { fcs: [], d2: [], d3: [] }, limitations: [],
      models: { d2: { ...model("d2"), target_season: 2025 } },
    });
    expect(archive.models.d2).toBeUndefined();
  });
});
