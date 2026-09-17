import { describe, expect, it } from "vitest";
import { normalizeNationalLeader } from "./LiveNationalPlayerTable";

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
});
