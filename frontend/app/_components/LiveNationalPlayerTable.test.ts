import { describe, expect, it } from "vitest";
import { metricValue, normalizeNationalLeader } from "./LiveNationalPlayerTable";

describe("live national player normalization", () => {
  it("uses live fields and fills the display line from the retained payload", () => {
    expect(normalizeNationalLeader({
      player_id: "42",
      name: "A Player",
      team_name: "A University",
      ppg: 21.5,
      publisher_rank: 3,
      payload: {
        conference: "Big Test",
        games: 30,
        rpg: 7.2,
        apg: 4.1,
        fg_pct: 52,
        three_pct: 39,
        ft_pct: 81,
        ppg_rank: 3,
      },
    })).toEqual({
      player_id: "42",
      division: 1,
      name: "A Player",
      team_name: "A University",
      conference: "Big Test",
      games: 30,
      ppg: 21.5,
      rpg: 7.2,
      apg: 4.1,
      spg: null,
      bpg: null,
      fg_pct: 52,
      three_pct: 39,
      ft_pct: 81,
      ppg_rank: 3,
    });
  });

  it("drops rows without an exact player identity", () => {
    expect(normalizeNationalLeader({ name: "Unknown" })).toBeNull();
  });

  it("reads a selected rate without losing unavailable fields", () => {
    const player = normalizeNationalLeader({ player_id: "7", name: "A Center", bpg: 2.4 });
    expect(player).not.toBeNull();
    expect(metricValue(player!, "bpg")).toBe(2.4);
    expect(metricValue(player!, "ft_pct")).toBeNull();
  });
});
