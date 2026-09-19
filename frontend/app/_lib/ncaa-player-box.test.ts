import { describe, expect, it } from "vitest";
import { completeStatsSum, effectiveFieldGoal, playerAdvancedRates, playerScoringProfile, safeRate, safeSum, trueShooting } from "./ncaa-player-box";

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
