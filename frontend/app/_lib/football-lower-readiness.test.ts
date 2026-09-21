import { describe, expect, it } from "vitest";
import { lowerFootballReadiness, lowerFootballReceiptStatus } from "./football-lower-readiness";
import type { LowerFootballResults } from "./football-lower-results";

const archive = (source: LowerFootballResults["source"] = {
  dataset: "schedule",
  season: 2026,
  url: "https://archive.test/schedule.csv.gz",
  fetched_at: "2026-09-20T12:00:00Z",
  sha256: "a".repeat(64),
}): LowerFootballResults => ({
  schema_version: 1,
  sport: "football",
  season: 2026,
  generated_at: "2026-09-20T12:00:00Z",
  scope: "D2/D3 completed schedule results",
  coverage: {
    fcs: { games: 0, score_complete: 0, scores_missing: 0 },
    d2: { games: 4, score_complete: 3, scores_missing: 1 },
    d3: { games: 0, score_complete: 0, scores_missing: 0 },
  },
  teams: {
    fcs: [],
    d2: [{ team_id: "d2-a", team: "D2 A", division: "d2", games: 3, wins: 2, losses: 1, points_for: 60, points_against: 50 }],
    d3: [],
  },
  rows: [],
  models: {},
  forecasts: { fcs: [], d2: [], d3: [] },
  limitations: [],
  source,
});

describe("lower football readiness", () => {
  it("keeps schedule and score evidence separate from unavailable player/model surfaces", () => {
    const rows = lowerFootballReadiness(archive());
    expect(rows).toEqual([
      {
        division: "d2",
        scheduleRows: 4,
        completeScoreRows: 3,
        scoreCoverage: 0.75,
        teamRows: 1,
        playerStats: "unavailable",
        predictions: "unavailable",
        receipt: "valid",
      },
      {
        division: "d3",
        scheduleRows: 0,
        completeScoreRows: 0,
        scoreCoverage: null,
        teamRows: 0,
        playerStats: "unavailable",
        predictions: "unavailable",
        receipt: "valid",
      },
    ]);
  });

  it("fails closed when receipt identity, timestamp, or hash is incomplete", () => {
    expect(lowerFootballReceiptStatus(archive({ dataset: "other", season: 2026, url: "x", fetched_at: "2026-09-20T12:00:00Z", sha256: "a".repeat(64) }))).toBe("unavailable");
    expect(lowerFootballReceiptStatus(archive({ dataset: "schedule", season: 2025, url: "x", fetched_at: "2026-09-20T12:00:00Z", sha256: "a".repeat(64) }))).toBe("unavailable");
    expect(lowerFootballReceiptStatus(archive({ dataset: "schedule", season: 2026, url: "x", fetched_at: "not-a-date", sha256: "a".repeat(64) }))).toBe("unavailable");
    expect(lowerFootballReceiptStatus(archive({ dataset: "schedule", season: 2026, url: "x", fetched_at: "2026-09-20T12:00:00Z", sha256: "short" }))).toBe("unavailable");
  });

  it("reports a forecast surface only when a model and forecast rows are published", () => {
    const edition = archive();
    edition.models = { d2: { id: "model-d2" } as LowerFootballResults["models"]["d2"] };
    edition.coverage.d2.forecast_games = 1;
    expect(lowerFootballReadiness(edition)[0].predictions).toBe("recorded");
    edition.coverage.d2.forecast_games = 0;
    expect(lowerFootballReadiness(edition)[0].predictions).toBe("unavailable");
  });
});
