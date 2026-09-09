import { describe, expect, it } from "vitest";
import { parsePlayerIndexFilters, playerIndexFilterSearch, rankPlayerProfiles } from "./player-index-view";

describe("historical player index URL state", () => {
  it("parses supported season, search, sort, qualification and page", () => {
    expect(parsePlayerIndexFilters("?season=2025&q=Jones&sort=profile&qualified=0&page=4", [2026, 2025, 2024])).toEqual({
      season: "2025",
      query: "Jones",
      sort: "profile",
      qualified: false,
      page: 4,
    });
  });

  it("uses safe catalog defaults for invalid controls", () => {
    expect(parsePlayerIndexFilters("?season=1999&sort=unknown&page=-1", [2026, 2025])).toEqual({
      season: "2026",
      query: "",
      sort: "ppg",
      qualified: true,
      page: 0,
    });
  });

  it("serializes only non-default controls", () => {
    expect(playerIndexFilterSearch({ season: "2025", query: "Jones", sort: "profile", qualified: false, page: 4 })).toBe("?season=2025&q=Jones&sort=profile&qualified=0&page=4");
    expect(playerIndexFilterSearch({ season: "2026", query: "", sort: "ppg", qualified: true, page: 0 })).toBe("");
  });

  it("ranks an explainable profile index with lower turnover rate favorable", () => {
    const rows = rankPlayerProfiles([
      { id: "a", team_id: "1", ppg: 20, rpg: 8, apg: 7, spg: 2, bpg: 1, ts: 0.65, efg: 0.62, tov_rate: 0.1 },
      { id: "b", team_id: "2", ppg: 12, rpg: 4, apg: 3, spg: 1, bpg: 0.2, ts: 0.52, efg: 0.48, tov_rate: 0.2 },
    ]);
    expect(rows[0]).toMatchObject({ id: "a", profileRank: 1, profileScore: 100, profileComponents: 8 });
    expect(rows[1]).toMatchObject({ id: "b", profileRank: 2, profileScore: 0, profileComponents: 8 });
  });

  it("withholds a profile score when fewer than four source metrics exist", () => {
    const rows = rankPlayerProfiles([
      { id: "a", team_id: "1", ppg: 20, rpg: 8, apg: 7, spg: null, bpg: null, ts: null, efg: null, tov_rate: null },
      { id: "b", team_id: "2", ppg: 12, rpg: 4, apg: 3, spg: null, bpg: null, ts: null, efg: null, tov_rate: null },
    ]);
    expect(rows.every((row) => row.profileScore === null && row.profileRank === null)).toBe(true);
    expect(rows.every((row) => row.profileComponents === 3)).toBe(true);
  });
});
