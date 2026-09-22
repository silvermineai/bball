import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { matchWomensShotProfiles, parseWomensShotPublication, womensShotProfileSearchHref, womensShotTendencyStats } from "./womens-shot-summary";

function publicationFixture(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 2,
    sport: "basketball",
    gender: "women",
    season: 2026,
    generated_at: "2026-09-21T08:46:30.956776Z",
    coordinate_system: { x_min_ft: -25, x_max_ft: 25, y_min_ft: -5.25, y_max_ft: 41.75, grid_columns: 10, grid_rows: 9 },
    coverage: { source_attempts: 2, profiles: 1, located_attempts: 1, ambiguous_profiles: 0 },
    profiles: [{
      profile_id: "AdaPlayer",
      name: "Ada Player",
      team: "Example",
      identity_status: "stable",
      attempts: 2,
      makes: 1,
      located_attempts: 1,
      cells: [{ column: 5, row: 1, attempts: 1, makes: 1 }],
      bands: [
        { label: "Rim", attempts: 1, makes: 1 },
        { label: "Paint", attempts: 0, makes: 0 },
        { label: "Midrange", attempts: 0, makes: 0 },
        { label: "3-point", attempts: 0, makes: 0 },
      ],
      sides: [
        { label: "Chart left", attempts: 0, makes: 0 },
        { label: "Middle", attempts: 1, makes: 1 },
        { label: "Chart right", attempts: 0, makes: 0 },
      ],
    }],
    receipt: { sha256: "a".repeat(64), url: "https://example.test/womens-shots.parquet" },
    limitations: ["Separate source identity namespace."],
    ...overrides,
  };
}

describe("women's shot tendency summaries", () => {
  it("accepts the checked-in NCAA women’s shot edition", () => {
    const edition = JSON.parse(readFileSync(new URL("../../public/data/basketball/womens-shots.json", import.meta.url), "utf8")) as unknown;
    const parsed = parseWomensShotPublication(edition);
    expect(parsed.coverage.profiles).toBe(parsed.profiles.length);
    expect(parsed.coverage.source_attempts).toBeGreaterThan(parsed.coverage.located_attempts);
  });

  it("validates scope, receipt, and reconciled coordinate coverage before rendering", () => {
    const parsed = parseWomensShotPublication(publicationFixture());
    expect(parsed.profiles).toHaveLength(1);
    expect(parsed.coverage).toMatchObject({ source_attempts: 2, located_attempts: 1 });
    expect(() => parseWomensShotPublication(publicationFixture({ gender: "men" }))).toThrow(/scope or schema version/);
    expect(() => parseWomensShotPublication(publicationFixture({ coverage: { source_attempts: 3, profiles: 1, located_attempts: 1, ambiguous_profiles: 0 } }))).toThrow(/coverage totals/);
  });

  it("rejects duplicate or out-of-bounds coordinate cells", () => {
    const duplicateCells = publicationFixture({
      profiles: [{
        ...publicationFixture().profiles[0],
        located_attempts: 2,
        cells: [{ column: 5, row: 1, attempts: 1, makes: 1 }, { column: 5, row: 1, attempts: 1, makes: 0 }],
      }],
      coverage: { source_attempts: 2, profiles: 1, located_attempts: 2, ambiguous_profiles: 0 },
    });
    expect(() => parseWomensShotPublication(duplicateCells)).toThrow(/invalid coordinate cell/);
    const outOfBounds = publicationFixture({
      profiles: [{ ...publicationFixture().profiles[0], cells: [{ column: 10, row: 1, attempts: 1, makes: 1 }] }],
    });
    expect(() => parseWomensShotPublication(outOfBounds)).toThrow(/invalid coordinate cell/);
  });

  it("uses located attempts for shares and recorded attempts for shooting rates", () => {
    const rows = womensShotTendencyStats([
      { label: "Rim", attempts: 40, makes: 28 },
      { label: "3-point", attempts: 60, makes: 21 },
    ], 100);

    expect(rows[0]).toMatchObject({ share: 0.4, makeRate: 0.7 });
    expect(rows[1]).toMatchObject({ share: 0.6, makeRate: 0.35 });
  });

  it("fails closed on impossible make counts and unavailable denominators", () => {
    expect(womensShotTendencyStats([
      { label: "Rim", attempts: 4, makes: 5 },
    ], 0)[0]).toMatchObject({ makes: 0, share: 0, makeRate: null });
  });

  it("creates a women’s shot archive label-search handoff without joining IDs", () => {
    expect(womensShotProfileSearchHref("Jade Jones")).toBe("/basketball/ncaa-shooting/?gender=women&division=1&q=Jade+Jones");
    expect(womensShotProfileSearchHref("")).toBe("/basketball/ncaa-shooting/?gender=women&division=1");
  });

  it("keeps exact and name-only matches separate for safe auto-open behavior", () => {
    const profiles = [
      { profile_id: "1", name: "Jade Jones", team: "Ga. Southern" },
      { profile_id: "2", name: "Jade Jones", team: "Fairfield" },
      { profile_id: "3", name: "Jada Jones", team: "Ga. Southern" },
    ];
    expect(matchWomensShotProfiles(profiles, "Jade Jones", "Ga. Southern")).toMatchObject({
      exact: [profiles[0]],
      compatible: [profiles[0]],
      nameMatches: [profiles[0], profiles[1]],
    });
    expect(matchWomensShotProfiles(profiles, "Jade Jones", "Unknown")).toMatchObject({
      exact: [],
      compatible: [],
      nameMatches: [profiles[0], profiles[1]],
    });
  });

  it("normalizes accents and punctuation without falling back to name-only identity", () => {
    const profiles = [{ profile_id: "1", name: "Zoë O'Connor", team: "St. Mary's" }];
    expect(matchWomensShotProfiles(profiles, "Zoe OConnor", "St Marys").exact).toHaveLength(1);
    expect(matchWomensShotProfiles(profiles, "Zoe OConnor", "Other").exact).toHaveLength(0);
  });

  it("recognizes a unique source abbreviation beside a full team label", () => {
    const profiles = [{ profile_id: "1", name: "Kenley McCarn", team: "UT Martin" }];
    expect(matchWomensShotProfiles(profiles, "Kenley McCarn", "UT Martin Skyhawks")).toMatchObject({
      exact: [],
      compatible: [profiles[0]],
    });
  });
});
