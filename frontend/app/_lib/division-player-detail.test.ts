import { describe, expect, it } from "vitest";
import {
  divisionPlayerDetailGroups,
  retainedPlayerDetailCount,
  retainedPlayerSourceRank,
  retainedPlayerValue,
  sortDivisionPlayers,
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

  it("keeps recorded zero values distinct from unavailable values when sorting", () => {
    const rows = [
      { division: 2, player_id: 3, name: "Unavailable", dbl_dbl: null },
      { division: 2, player_id: 2, name: "Zero", dbl_dbl: 0 },
      { division: 2, player_id: 1, name: "Leader", dbl_dbl: 4 },
    ];
    expect(sortDivisionPlayers(rows, "dbl_dbl").map((row) => row.name)).toEqual([
      "Leader",
      "Zero",
      "Unavailable",
    ]);
  });

  it("exposes only the exact selected publisher rank", () => {
    const player = {
      division: 2,
      player_id: 11,
      name: "Ranked Guard",
      ppg_rank: 7,
      source_stats: {
        ppg: { headers: ["Rank", "PPG"], cells: ["7", "20.0"], rank: 7, value: 20 },
      },
    };
    expect(retainedPlayerSourceRank(player, "ppg")).toBe(7);
    expect(retainedPlayerSourceRank(player, "pts")).toBeNull();
    expect(retainedPlayerSourceRank({ ...player, source_stats: {} }, "ppg")).toBe(7);
    expect(retainedPlayerSourceRank({ ...player, ppg_rank: 0, source_stats: {} }, "ppg")).toBeNull();
  });
});
