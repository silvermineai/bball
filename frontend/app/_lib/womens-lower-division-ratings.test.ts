import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  filterWomensLowerRatings,
  parseWomensLowerRatingsAsset,
  sortWomensLowerRatings,
  type WomensLowerRating,
} from "./womens-lower-division-ratings";

const release = JSON.parse(readFileSync("public/data/basketball/womens-lower-division-ratings.json", "utf8")) as unknown;

const rating = (overrides: Partial<WomensLowerRating> = {}): WomensLowerRating => ({
  rank: 1,
  team_id: "alpha",
  team: "Alpha College",
  conference: "North",
  games: 20,
  wins: 15,
  losses: 5,
  win_pct: 0.75,
  avg_margin: 4.5,
  rating: 7.2,
  ...overrides,
});
describe("women's lower-division ratings", () => {
  it("parses the checked-in women's research-only contract for both divisions", () => {
    const parsed = parseWomensLowerRatingsAsset(release);
    expect(parsed.divisions.d2.model_id).toMatch(/^wbb-lower-ratings-v1-d2-/);
    expect(parsed.divisions.d3.model_id).toMatch(/^wbb-lower-ratings-v1-d3-/);
    expect(parsed.divisions.d2.ratings.length).toBe(parsed.divisions.d2.coverage.teams);
  });

  it("fails closed when a source contract loses its exact women scope or rank sequence", () => {
    expect(() => parseWomensLowerRatingsAsset({ ...(release as Record<string, unknown>), gender: "men" })).toThrow("Invalid women's lower ratings asset");
    const malformed = structuredClone(release) as { divisions: { d2: { ratings: Array<Record<string, unknown>> } } };
    malformed.divisions.d2.ratings[0].rank = 2;
    expect(() => parseWomensLowerRatingsAsset(malformed)).toThrow("row 1");
  });

  it("filters by source team labels, IDs, and conferences", () => {
    expect(filterWomensLowerRatings([rating(), rating({ rank: 2, team_id: "beta", team: "Beta State", conference: "South" })], "south").map((row) => row.team_id)).toEqual(["beta"]);
  });

  it("sorts numerical metrics and team names without changing source rank values", () => {
    const rows = [rating(), rating({ rank: 2, team_id: "beta", team: "Beta State", rating: 9 })];
    expect(sortWomensLowerRatings(rows, "rating").map((row) => row.team_id)).toEqual(["beta", "alpha"]);
    expect(sortWomensLowerRatings(rows, "team", "asc").map((row) => row.team_id)).toEqual(["alpha", "beta"]);
  });
});
