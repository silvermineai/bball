import { describe, expect, it } from "vitest";
import { findWomensPlayerProfile, finiteWomensProfileValue } from "./womens-player-profile";

describe("women's player profile joins", () => {
  const season = [{
    player_id: "7", name: "A. Guard", team: "North", position: "G",
    stats: { avgPoints: 12 },
  }];
  const box = [{
    player_id: "7", name: "A. Guard", team: "North", team_id: "10", position: "G",
    box_rows: 4, dnp_rows: 1, games_played: 3, starts: 2,
    totals: { points: 36 }, per_game: { points: 12 },
    shooting: { field_goal_pct: 50, three_point_pct: null, free_throw_pct: 80 },
  }];

  it("joins season and box evidence by exact player ID", () => {
    const profile = findWomensPlayerProfile("7", season, box);
    expect(profile?.name).toBe("A. Guard");
    expect(profile?.season?.stats.avgPoints).toBe(12);
    expect(profile?.box?.games_played).toBe(3);
  });

  it("keeps box-only players visible without a name join", () => {
    const profile = findWomensPlayerProfile("8", [], [{ ...box[0], player_id: "8", name: "Box only" }]);
    expect(profile?.name).toBe("Box only");
    expect(profile?.season).toBeNull();
  });

  it("does not match a different ID that happens to share a name", () => {
    const profile = findWomensPlayerProfile("9", [{ ...season[0], player_id: "8" }], [{ ...box[0], player_id: "7" }]);
    expect(profile).toBeNull();
  });

  it("preserves missing and non-finite values", () => {
    expect(finiteWomensProfileValue(4)).toBe(4);
    expect(finiteWomensProfileValue(null)).toBeNull();
    expect(finiteWomensProfileValue(Number.NaN)).toBeNull();
  });
});
