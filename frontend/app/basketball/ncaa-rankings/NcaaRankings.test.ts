import { describe, expect, it } from "vitest";
import { validateNcaaRankingExportPage, type NcaaRankingResult } from "./NcaaRankings";

describe("NCAA ranking export pagination", () => {
  const page = (overrides: Partial<NcaaRankingResult> = {}): NcaaRankingResult => ({
    season: 2026,
    metric: "balanced_index",
    direction: "desc",
    min_games: 5,
    min_minutes: 200,
    min_volume: 0,
    page: 0,
    page_size: 1,
    total: 2,
    rows: [{} as NcaaRankingResult["rows"][number]],
    ...overrides,
  });

  it("accepts a page with stable ranking metadata", () => {
    expect(validateNcaaRankingExportPage(page(), 2026, "balanced_index", "desc", 5, 200, 0, 2, 1, 0, 2)).toHaveLength(1);
  });

  it("rejects changed filters or ranking identity", () => {
    expect(() => validateNcaaRankingExportPage(page({ min_minutes: 400 }), 2026, "balanced_index", "desc", 5, 200, 0, 2, 1, 0, 2)).toThrow(/changed/);
    expect(() => validateNcaaRankingExportPage(page({ page: 1 }), 2026, "balanced_index", "desc", 5, 200, 0, 2, 1, 0, 2)).toThrow(/changed/);
  });

  it("rejects an empty intermediate page", () => {
    expect(() => validateNcaaRankingExportPage(page({ rows: [] }), 2026, "balanced_index", "desc", 5, 200, 0, 2, 1, 0, 2)).toThrow(/incomplete page/);
  });
});
