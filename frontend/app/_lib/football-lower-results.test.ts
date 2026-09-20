import { describe, expect, it } from "vitest";
import { lowerResultsForDivision, validateLowerFootballResults } from "./football-lower-results";

const row = (division: "d2" | "d3", score_complete = true) => ({
  game_id: `${division}-1`, kickoff: "2026-09-01T00:00:00Z", week: 1,
  scope_division: division, home_id: `${division}-home`, home_name: "Home", home_division: division,
  away_id: `${division}-away`, away_name: "Away", away_division: division,
  home_score: score_complete ? 21 : null, away_score: score_complete ? 14 : null,
  neutral: false, score_complete,
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
});
