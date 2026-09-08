import { describe, expect, it } from "vitest";
import { lineupFilterSearch, parseLineupFilters } from "./lineups";

describe("shareable lineup filters", () => {
  it("serializes a complete scouting slice", () => {
    const search = lineupFilterSearch({
      season: 2019,
      metric: "def_rtg",
      minPoss: "100",
      direction: "asc",
      query: "Kansas",
      page: 2,
    });
    expect(search).toBe("?season=2019&metric=def_rtg&minPoss=100&direction=asc&q=Kansas&page=2");
    expect(parseLineupFilters(search)).toEqual({
      season: 2019,
      metric: "def_rtg",
      minPoss: "100",
      direction: "asc",
      query: "Kansas",
      page: 2,
    });
  });

  it("drops unsupported values and omits defaults", () => {
    expect(parseLineupFilters("?season=1900&metric=sql&minPoss=999&page=-4")).toEqual({
      season: 2026,
      metric: "net_per_100",
      minPoss: "40",
      direction: "desc",
      query: "",
      page: 0,
    });
    expect(lineupFilterSearch({ season: 2026, metric: "net_per_100", minPoss: "40", direction: "desc", query: "  ", page: 0 })).toBe("");
  });
});
