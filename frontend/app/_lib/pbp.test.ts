import { describe, expect, it } from "vitest";
import { parsePbpFilters, pbpFilterSearch } from "./pbp";

describe("shareable PBP filters", () => {
  it("serializes a non-default season and query", () => {
    const search = pbpFilterSearch({ season: 2022, query: "Purdue at Iowa" }, 2026);
    expect(search).toBe("?season=2022&q=Purdue+at+Iowa");
    expect(parsePbpFilters(search, 2026, [2019, 2022, 2026])).toEqual({
      season: 2022,
      query: "Purdue at Iowa",
    });
  });

  it("falls back for an unsupported season and omits defaults", () => {
    expect(parsePbpFilters("?season=1900", 2026, [2019, 2026])).toEqual({
      season: 2026,
      query: "",
    });
    expect(pbpFilterSearch({ season: 2026, query: "  " }, 2026)).toBe("");
  });
});
