import { describe, expect, it } from "vitest";
import {
  divisionPlayerDetailGroups,
  retainedPlayerDetailCount,
  retainedPlayerValue,
} from "./division-player-detail";

describe("division player retained detail", () => {
  it("catalogs the season totals and attempt fields exposed by the release", () => {
    const keys = divisionPlayerDetailGroups.flatMap((group) => group.fields.map(([key]) => key));
    expect(keys).toEqual(expect.arrayContaining([
      "pts", "reb", "ast", "stl", "blk", "tov", "orb", "drb", "pf", "mins",
      "fgm", "fga", "three_fgm", "three_fga", "ftm", "fta", "o_poss",
    ]));
  });

  it("preserves unavailable values instead of coercing them to zero", () => {
    const player = { division: 2, player_id: 11, name: "A", pts: 400, fga: null, tov: Number.NaN };
    expect(retainedPlayerValue(player, "pts")).toBe(400);
    expect(retainedPlayerValue(player, "fga")).toBeNull();
    expect(retainedPlayerValue(player, "tov")).toBeNull();
    expect(retainedPlayerDetailCount(player)).toBe(1);
  });
});
