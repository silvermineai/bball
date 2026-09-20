import { describe, expect, it } from "vitest";
import { accuracySample, rankingPlayerShotMapHref, rankingRecordedDetail, rankingStatLine, validateNcaaRankingExportPage, type NcaaRankingResult } from "./NcaaRankings";

describe("NCAA ranking stat context", () => {
  it("hands exact ranking IDs directly to the player shot profile", () => {
    expect(rankingPlayerShotMapHref("10007029", 2026)).toBe("/basketball/ncaa-player/?id=10007029&season=2026#shot-profile");
    expect(rankingPlayerShotMapHref("source:player/42", 2025)).toBe("/basketball/ncaa-player/?id=source%3Aplayer%2F42&season=2025#shot-profile");
  });

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

  it("keeps denominator-backed source fields available as a compact detail line", () => {
    expect(rankingRecordedDetail({
      fgm: 100, fga: 200, tpm: 32, tpa: 80, ftm: 40, fta: 50,
      offensive_rebounds: 20, defensive_rebounds: 80, possessions: 120,
      team_possessions: 800, rim_makes: 30, rim_attempts: 50,
      mid_makes: 10, mid_attempts: 30, transition_points: 40,
      putback_makes: 12, putback_attempts: 20,
      unassisted_attempts: 120,
      unassisted_points: 100,
    })).toBe("FG 100/200 · 3P 32/80 · FT 40/50 · ORB 20 · DRB 80 · Poss 120 · Team poss 800 · Rim 30/50 · Mid 10/30 · Putback 12/20 · Trans pts 40 · Unast FGA 120 · Unast pts 100");
    expect(rankingRecordedDetail({ fga: 200, fta: null })).toBe("");
  });

  it("exports the exact residual makes and attempts behind two-point accuracy", () => {
    const row = { fgm: 150, fga: 300, tpm: 48, tpa: 120 } as NcaaRankingResult["rows"][number];
    expect(accuracySample("two_pct", row)).toEqual([102, 180]);
    expect(accuracySample("two_pct", { ...row, tpa: null })).toEqual([null, null]);
    expect(accuracySample("two_pct", { ...row, fgm: 40 })).toEqual([null, null]);
    expect(accuracySample("putback_pct", { putback_makes: 18, putback_attempts: 30 } as NcaaRankingResult["rows"][number])).toEqual([18, 30]);
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
