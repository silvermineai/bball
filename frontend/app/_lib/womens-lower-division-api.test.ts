import { describe, expect, it } from "vitest";
import { parseWomensLowerStatsMeta, parseWomensLowerStatsResponse } from "./womens-lower-division-api";

const sourceUrl = "https://www.ncaa.com/stats/basketball-women/d2/individual";

describe("women's lower-division stats API boundary", () => {
  it("accepts an exact individual catalog scope", () => {
    const result = parseWomensLowerStatsMeta({
      division: "2",
      kind: "individual",
      statistics: [{ statistic: "scoring", label: "Scoring", rows: 50, source_url: sourceUrl }],
      source_receipts: [{ sha256: "a".repeat(64) }],
    }, "2");
    expect(result.statistics[0]).toMatchObject({ statistic: "scoring", rows: 50 });
  });

  it("rejects a response from another division or kind", () => {
    expect(() => parseWomensLowerStatsMeta({
      division: "3",
      kind: "individual",
      statistics: [],
    }, "2")).toThrow(/scope is invalid/);
    expect(() => parseWomensLowerStatsResponse({
      division: "2",
      kind: "team",
      statistic: "scoring",
      label: "Scoring",
      headers: ["Rank"],
      rows: [],
      source_url: sourceUrl,
    }, "2", "scoring")).toThrow(/scope is invalid/);
  });

  it("retains source rows and receipt evidence without creating IDs", () => {
    const result = parseWomensLowerStatsResponse({
      division: "3",
      kind: "individual",
      statistic: "scoring",
      label: "Scoring",
      headers: ["Rank", "Name", "Team", "PPG"],
      rows: [{ rank: 1, name: "Example Player", team: "Example College", source_fields: { PPG: "22.4" } }],
      source_url: "https://www.ncaa.com/stats/basketball-women/d3/individual",
      through_games: "20",
      source_receipts: [{ sha256: "b".repeat(64) }],
    }, "3", "scoring");
    expect(result.rows[0]).toMatchObject({ name: "Example Player", source_fields: { PPG: "22.4" } });
    expect(result).toMatchObject({ source_url: "https://www.ncaa.com/stats/basketball-women/d3/individual", through_games: "20" });
    expect("player_id" in result.rows[0]).toBe(false);
  });
});
