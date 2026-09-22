import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  filterMensLowerRatings,
  parseMensLowerRatingsAsset,
  sortMensLowerRatings,
  type MensLowerRating,
} from "./mens-lower-division-ratings";

const release = JSON.parse(readFileSync("public/data/basketball/mens-lower-division-ratings.json", "utf8")) as unknown;

const rating = (overrides: Partial<MensLowerRating> = {}): MensLowerRating => ({
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

describe("men's lower-division ratings", () => {
  it("parses the checked-in men's research-only contract", () => {
    const parsed = parseMensLowerRatingsAsset(release);
    expect(parsed.divisions.d2.model_id).toMatch(/^mbb-lower-ratings-v1-d2-/);
    expect(parsed.divisions.d3.model_id).toMatch(/^mbb-lower-ratings-v1-d3-/);
  });

  it("fails closed for a different gender or broken rank sequence", () => {
    expect(() => parseMensLowerRatingsAsset({ ...(release as Record<string, unknown>), gender: "women" })).toThrow("Invalid men's lower ratings asset");
    const malformed = structuredClone(release) as { divisions: { d2: { ratings: Array<Record<string, unknown>> } } };
    malformed.divisions.d2.ratings[0].rank = 2;
    expect(() => parseMensLowerRatingsAsset(malformed)).toThrow("row 1");
  });

  it("filters by exact team labels, IDs, and conferences", () => {
    expect(filterMensLowerRatings([rating(), rating({ rank: 2, team_id: "beta", team: "Beta State", conference: "South" })], "south").map((row) => row.team_id)).toEqual(["beta"]);
  });

  it("sorts numerical metrics and team names in both directions", () => {
    const rows = [rating(), rating({ rank: 2, team_id: "beta", team: "Beta State", rating: 9 })];
    expect(sortMensLowerRatings(rows, "rating").map((row) => row.team_id)).toEqual(["beta", "alpha"]);
    expect(sortMensLowerRatings(rows, "team", "asc").map((row) => row.team_id)).toEqual(["alpha", "beta"]);
  });
});

