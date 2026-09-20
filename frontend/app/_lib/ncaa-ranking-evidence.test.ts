import { describe, expect, it } from "vitest";
import { rankingEvidence } from "./ncaa-ranking-evidence";

describe("NCAA ranking source evidence", () => {
  it("shows the full retained true-shooting formula inputs", () => {
    expect(rankingEvidence("ts", { points: 400, fga: 300, fta: 80 })).toEqual({
      primary: "400 PTS",
      detail: "300 FGA + 0.475 × 80 FTA",
    });
    expect(rankingEvidence("half_ts", { half_points: 280, half_fga: 230, half_fta: 60 })).toEqual({
      primary: "280 HALF-COURT PTS",
      detail: "230 FGA + 0.475 × 60 FTA",
    });
  });

  it("uses the denominator that qualifies each ranking rate", () => {
    expect(rankingEvidence("three_pct", { tpm: 48, tpa: 120 })).toEqual({
      primary: "48 3PM",
      detail: "120 3PA",
    });
    expect(rankingEvidence("two_pct", { fgm: 150, fga: 300, tpm: 48, tpa: 120 })).toEqual({
      primary: "102 2PM",
      detail: "180 2PA",
    });
    expect(rankingEvidence("tov_rate", { turnovers: 37, possessions: 412.5 })).toEqual({
      primary: "37 TO",
      detail: "412.5 POSS",
    });
    expect(rankingEvidence("poss_share", { possessions: 400, team_possessions: 2_000 })).toEqual({
      primary: "400 PLAYER POSS",
      detail: "2,000 TEAM POSS",
    });
    expect(rankingEvidence("unassisted_rate", { unassisted_attempts: 96, unassisted_total_attempts: 240 })).toEqual({
      primary: "96 UNAST FGA",
      detail: "240 FGA",
    });
    expect(rankingEvidence("putback_pct", { putback_makes: 18, putback_attempts: 30 })).toEqual({
      primary: "18 PUTBACK MAKES",
      detail: "30 PUTBACK ATT",
    });
  });

  it("withholds evidence when any required source input is unavailable", () => {
    expect(rankingEvidence("efg", { fgm: 150, tpm: null, fga: 300 })).toBeNull();
    expect(rankingEvidence("stocks40", { steals: 30, blocks: undefined, minutes: 600 })).toBeNull();
    expect(rankingEvidence("half_ts", { half_points: 280, half_fga: 230, half_fta: null })).toBeNull();
    expect(rankingEvidence("two_pct", { fgm: 150, fga: 300, tpm: 48, tpa: null })).toBeNull();
    expect(rankingEvidence("two_pct", { fgm: 40, fga: 200, tpm: 48, tpa: 100 })).toBeNull();
    expect(rankingEvidence("unassisted_rate", { unassisted_attempts: null, unassisted_total_attempts: 240 })).toBeNull();
    expect(rankingEvidence("unassisted_rate", { unassisted_attempts: 96, unassisted_total_attempts: null })).toBeNull();
    expect(rankingEvidence("putback_pct", { putback_makes: 18, putback_attempts: null })).toBeNull();
  });

  it("does not add an evidence column to directly recorded ranking totals", () => {
    expect(rankingEvidence("ppg", { points: 400 })).toBeNull();
  });
});
