import { describe, expect, it } from "vitest";
import { parsePlayerIndexFilters, playerIndexFilterSearch } from "./player-index-view";

describe("historical player index URL state", () => {
  it("parses supported season, search, sort, qualification and page", () => {
    expect(parsePlayerIndexFilters("?season=2025&q=Jones&sort=ts&qualified=0&page=4", [2026, 2025, 2024])).toEqual({
      season: "2025",
      query: "Jones",
      sort: "ts",
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
    expect(playerIndexFilterSearch({ season: "2025", query: "Jones", sort: "ts", qualified: false, page: 4 })).toBe("?season=2025&q=Jones&sort=ts&qualified=0&page=4");
    expect(playerIndexFilterSearch({ season: "2026", query: "", sort: "ppg", qualified: true, page: 0 })).toBe("");
  });
});
