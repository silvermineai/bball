import { describe, expect, it } from "vitest";
import { rankingStatLine, validateNcaaRankingExportPage, type NcaaRankingResult } from "./NcaaRankings";

describe("NCAA ranking stat context", () => {
  it("keeps common per-game and shooting rates visible for every selected metric", () => {
    expect(rankingStatLine({
      games: 20, points: 300, rebounds: 100, assists: 60, steals: 20, blocks: 5,
      fga: 200, fgm: 100, tpa: 80, tpm: 32, fta: 50, ftm: 40,
    })).toBe("PPG 15.0 · RPG 5.0 · APG 3.0 · SPG 1.0 · BPG 0.3 · TS 67.0% · eFG 58.0% · 3P 40.0% · FT 80.0%");
  });

  it("keeps rates unavailable when the retained denominator is missing", () => {
    expect(rankingStatLine({
      games: 20, points: 300, rebounds: null, assists: null, steals: null, blocks: null,
      fga: null, fgm: null, tpa: null, tpm: null, fta: null, ftm: null,
    })).toContain("TS —% · eFG —% · 3P —% · FT —%");
  });
});

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
