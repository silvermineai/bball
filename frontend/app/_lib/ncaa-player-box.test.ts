import { describe, expect, it } from "vitest";
import { completeStatsSum, effectiveFieldGoal, playerAdvancedRates, playerScoringProfile, playerSeasonBoxSummary, safeRate, safeSum, trueShooting, trueShootingDenominator } from "./ncaa-player-box";

describe("NCAA player box rate helpers", () => {
  it("keeps missing source fields unavailable while preserving recorded zero makes", () => {
    expect(safeRate(0, 10)).toBe(0);
    expect(safeRate(null, 10)).toBeNull();
    expect(safeRate(4, null)).toBeNull();
    expect(safeRate(4, 0)).toBeNull();
  });

  it("requires both TS denominators before computing the disclosed fallback", () => {
    expect(trueShooting({ pts: 20, fga: 10, fta: 4 })).toBeCloseTo(20 / (2 * (10 + 0.475 * 4)));
    expect(trueShooting({ pts: 20, fga: null, fta: 4 })).toBeNull();
    expect(trueShooting({ pts: 20, fga: 10, fta: undefined })).toBeNull();
    expect(trueShooting({ pts: 0, fga: 10, fta: 0 })).toBe(0);
  });

  it("exposes the TS denominator audit without manufacturing missing inputs", () => {
    expect(trueShootingDenominator({ fga: 10, fta: 4 })).toBe(23.8);
    expect(trueShootingDenominator({ fga: 10, fta: null })).toBeNull();
    expect(trueShootingDenominator({ fga: Number.NaN, fta: 4 })).toBeNull();
    expect(trueShootingDenominator({ fga: -1, fta: 4 })).toBeNull();
  });

  it("keeps composite rebounds unavailable when either component is missing", () => {
    expect(safeSum(3, 7)).toBe(10);
    expect(safeSum(null, 7)).toBeNull();
    expect(safeSum(3, undefined)).toBeNull();
  });

  it("pools multi-team season fields only when every stint is observed", () => {
    expect(completeStatsSum([{ stats: { pts: 20 } }, { stats: { pts: 30 } }], "pts")).toBe(50);
    expect(completeStatsSum([{ stats: { pts: 20 } }, { stats: { pts: null } }], "pts")).toBeNull();
    expect(completeStatsSum([{ stats: { pts: 0 } }, { stats: { pts: 5 } }], "pts")).toBe(5);
  });

  it("keeps defensive production and double-doubles tied to exact retained stints", () => {
    expect(playerSeasonBoxSummary([
      { stats: { mins: 500, pts: 300, orb: 40, drb: 80, ast: 60, stl: 18, blk: 12, tov: 30, pf: 45, dbl_dbl: 4 } },
      { stats: { mins: 200, pts: 120, orb: 15, drb: 25, ast: 24, stl: 7, blk: 3, tov: 11, pf: 18, dbl_dbl: 2 } },
    ])).toEqual({
      minutes: 700,
      points: 420,
      rebounds: 160,
      assists: 84,
      steals: 25,
      blocks: 15,
      turnovers: 41,
      fouls: 63,
      doubleDoubles: 6,
    });
    expect(playerSeasonBoxSummary([
      { stats: { stl: 2, blk: null, dbl_dbl: 1 } },
      { stats: { stl: 3, blk: 1, dbl_dbl: null } },
    ])).toMatchObject({ steals: 5, blocks: null, doubleDoubles: null });
  });

  it("derives player rates only from their recorded denominators", () => {
    expect(playerAdvancedRates({ pts: 30, o_poss: 20, tpa: 4, fga: 10, fta: 6, ast: 5, tov: 2 })).toEqual({
      pointsPerPossession: 1.5,
      threePointAttemptRate: 0.4,
      freeThrowAttemptRate: 0.6,
      assistRate: 0.25,
      turnoverRate: 0.1,
    });
    expect(playerAdvancedRates({ pts: 30, o_poss: null, tpa: 4, fga: 10, fta: 6, ast: 5, tov: 2 }).pointsPerPossession).toBeNull();
  });

  it("requires threes as well as field goals for the eFG fallback", () => {
    expect(effectiveFieldGoal(5, 2, 10)).toBeCloseTo(0.6);
    expect(effectiveFieldGoal(5, null, 10)).toBeNull();
    expect(effectiveFieldGoal(5, 2, null)).toBeNull();
  });

  it("builds zone and scoring-context rows from retained totals", () => {
    const profile = playerScoringProfile({
      pts: 120,
      fgm: 45,
      fga: 100,
      rimm: 20,
      rima: 25,
      midm: 10,
      mida: 25,
      tpm: 15,
      tpa: 50,
      pbackm: 3,
      pbacka: 4,
      fgm_trans: 12,
      fga_trans: 20,
      tpm_trans: 4,
      pts_trans: 32,
      fgm_unast: 25,
      fga_unast: 60,
      tpm_unast: 5,
      pts_unast: 65,
      fgm_ast: 20,
      rimm_ast: 8,
      tpm_ast: 10,
    });

    expect(profile.zones[0]).toMatchObject({
      key: "rim",
      makes: 20,
      attempts: 25,
      accuracy: 0.8,
      attemptShare: 0.25,
    });
    expect(profile.contexts[1]).toMatchObject({
      key: "transition",
      effectiveFieldGoal: 0.7,
      attemptShare: 0.2,
      pointShare: 32 / 120,
    });
    expect(profile.assistedMakeShare).toBeCloseTo(20 / 45);
    expect(profile.assistedRimMakeShare).toBe(0.4);
    expect(profile.assistedThreeMakeShare).toBeCloseTo(2 / 3);
  });

  it("does not manufacture scoring splits when a source field is missing", () => {
    const transferRows = [
      { stats: { rimm: 10, rima: 14 } },
      { stats: { rimm: 8, rima: null } },
    ];
    const profile = playerScoringProfile({
      pts: 80,
      fgm: 30,
      fga: 70,
      rimm: completeStatsSum(transferRows, "rimm"),
      rima: completeStatsSum(transferRows, "rima"),
      fgm_trans: null,
      fga_trans: 12,
      tpm_trans: 2,
      pts_trans: 20,
      fgm_ast: null,
      tpm: 0,
      tpm_ast: 0,
    });

    expect(profile.zones[0]).toMatchObject({
      makes: 18,
      attempts: null,
      accuracy: null,
      attemptShare: null,
    });
    expect(profile.contexts[1]).toMatchObject({
      accuracy: null,
      effectiveFieldGoal: null,
      attemptShare: 12 / 70,
      pointShare: 0.25,
    });
    expect(profile.assistedMakeShare).toBeNull();
    expect(profile.assistedThreeMakeShare).toBeNull();
  });
});
