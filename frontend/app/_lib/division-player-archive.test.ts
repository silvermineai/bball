import { describe, expect, it } from "vitest";
import {
  divisionPlayerArchiveExport,
  filterDivisionPlayerArchive,
  paginateDivisionPlayerArchive,
} from "./division-player-archive";

const players = [
  { player_id: 1, division: 2, name: "Beta Guard", team_name: "North", ppg: 20, pts: 400 },
  { player_id: 2, division: 2, name: "Alpha Wing", team_name: "South", ppg: 25, pts: 450 },
  { player_id: 3, division: 3, name: "Other Division", team_name: "West", ppg: 99, pts: 900 },
];

describe("division player archive", () => {
  it("filters by exact division and search before sorting", () => {
    expect(filterDivisionPlayerArchive(players, "2", "north", "ppg").map((player) => player.name)).toEqual(["Beta Guard"]);
    expect(filterDivisionPlayerArchive(players, "2", "", "ppg").map((player) => player.name)).toEqual(["Alpha Wing", "Beta Guard"]);
  });

  it("bounds pages and clamps a stale page after a filter shrinks", () => {
    expect(paginateDivisionPlayerArchive(players, 99, 2)).toMatchObject({ page: 1, pages: 2, total: 3 });
    expect(paginateDivisionPlayerArchive(players.slice(0, 1), 99, 2)).toMatchObject({ page: 0, pages: 1, total: 1 });
  });

  it("exports all retained fields and exact source evidence without deriving values", () => {
    const result = divisionPlayerArchiveExport([{
      ...players[0],
      fga: null,
      source_stats: { ppg: { headers: ["Rank", "PPG"], cells: ["1", "20.0"], rank: 1, value: 20 } },
    }]);
    expect(result.headers.slice(0, 4)).toEqual(["player_id", "name", "team_name", "division"]);
    expect(result.headers).toContain("fga");
    expect(result.headers).toContain("source_stats_json");
    expect(result.rows[0][result.headers.indexOf("fga")]).toBeNull();
    expect(String(result.rows[0][result.headers.indexOf("source_stats_json")])).toContain('"PPG"');
  });
});
