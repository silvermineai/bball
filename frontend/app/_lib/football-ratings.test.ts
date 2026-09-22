import { describe, expect, it } from "vitest";
import { joinFootballRatingEfficiency } from "./football-ratings";
import type { EfficiencyIndex } from "./football-efficiency";
import type { Overview } from "./data";

const ratings: Overview["ratings"] = [
  { id: "1", name: "Alpha", conference: "A", rating: 10, rank: 1 },
  { id: "2", name: "Beta", conference: "B", rating: 9, rank: 2 },
];

function index(): EfficiencyIndex {
  return {
    edition: "edition",
    definitions_url: "",
    metrics: [],
    sources: [],
    seasons: [{
      season: 2026,
      records: 2,
      games: 1,
      paired_games: 1,
      source_fetched_at: "2026-09-22T00:00:00Z",
      teams: [{
        id: "1",
        name: "Different display name",
        season: 2026,
        division: "fbs",
        conference: "A",
        profile_hash: "hash",
        samples: {
          all: {
            games: 3,
            paired_games: 3,
            scheduled_finals: 3,
            missing_games: [],
            offense: {
              epa: { value: 0, numerator: 0, denominator: 10, games: 3 },
              ypp: { value: 6.25, numerator: 62.5, denominator: 10, games: 3 },
            },
            defense: {
              epa: { value: -0.1, numerator: -1, denominator: 10, games: 3 },
              ypp: { value: null, numerator: 0, denominator: 0, games: 0 },
            },
          },
          fbs: {} as never,
        },
      }],
    }],
  };
}

describe("football rating efficiency join", () => {
  it("joins only by exact team ID and preserves measured zeroes", () => {
    const rows = joinFootballRatingEfficiency(ratings, index(), 2026);
    expect(rows[0].efficiency).toMatchObject({
      division: "fbs",
      games: 3,
      offense_epa: 0,
      offense_ypp: 6.25,
      defense_epa: -0.1,
      defense_ypp: null,
    });
    expect(rows[1].efficiency).toBeNull();
  });

  it("does not fall back to another season when the requested edition is absent", () => {
    expect(joinFootballRatingEfficiency(ratings, index(), 2025).every((row) => row.efficiency === null)).toBe(true);
  });
});
