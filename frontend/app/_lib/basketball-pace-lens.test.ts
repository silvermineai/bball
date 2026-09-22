import { describe, expect, it } from "vitest";
import { matchupPaceLens } from "./basketball-pace-lens";

describe("matchupPaceLens", () => {
  it("compares the published pace with exact-ID prior tempo context", () => {
    const lens = matchupPaceLens(
      { pace: 72 },
      { adj_tempo: 68 },
      { adj_tempo: 64 },
    );
    expect(lens).toMatchObject({
      projected: 72,
      prior_home: 68,
      prior_away: 64,
      prior_mean: 66,
      projected_delta: 6,
      home_delta: 4,
      away_delta: 8,
      tempo_gap: 4,
      faster_team: "home",
      environment: "faster",
    });
  });

  it("labels a near-prior game and an even tempo matchup", () => {
    const lens = matchupPaceLens(
      { pace: 69 },
      { adj_tempo: 68.98 },
      { adj_tempo: 69.02 },
    );
    expect(lens?.environment).toBe("near_prior");
    expect(lens?.faster_team).toBe("even");
  });

  it("withholds the lens when source tempo or forecast pace is unavailable", () => {
    expect(matchupPaceLens({ pace: 70 }, { adj_tempo: 68 }, undefined)).toBeNull();
    expect(matchupPaceLens({ pace: 0 }, { adj_tempo: 68 }, { adj_tempo: 68 })).toBeNull();
    expect(matchupPaceLens({ pace: 70 }, { adj_tempo: Number.NaN }, { adj_tempo: 68 })).toBeNull();
  });
});
