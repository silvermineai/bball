import { describe, expect, it } from "vitest";
import { womensSnapshotCoverageRows } from "./WomensBasketballSnapshot";

describe("womensSnapshotCoverageRows", () => {
  it("maps explicit release counters to player archive labels", () => {
    const rows = womensSnapshotCoverageRows({
      player_season_rows: 41_919,
      player_box_players: 9_870,
      player_box_rows: 168_228,
      player_box_games: 6_029,
      player_box_played_rows: 122_138,
      player_box_dnp_rows: 46_088,
      player_box_teams: 663,
    });

    expect(rows.map(({ key, value }) => [key, value])).toEqual([
      ["player_season_rows", 41_919],
      ["player_box_players", 9_870],
      ["player_box_rows", 168_228],
      ["player_box_games", 6_029],
      ["player_box_played_rows", 122_138],
      ["player_box_dnp_rows", 46_088],
      ["player_box_teams", 663],
    ]);
  });

  it("preserves unavailable counters instead of turning them into zero", () => {
    const rows = womensSnapshotCoverageRows({ player_box_rows: 12 });
    expect(rows.find(({ key }) => key === "player_box_rows")?.value).toBe(12);
    expect(rows.find(({ key }) => key === "player_box_players")?.value).toBeUndefined();
  });
});
