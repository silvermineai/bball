import { describe, expect, it } from "vitest";
import { divisionMetricLabel, divisionMetricValue, rankDivisionPlayers } from "./division-player-rankings";

const players = [
  { player_id: 1, division: 2, name: "A Guard", team_name: "North", games: 20, ppg: 22, ppg_rank: 3 },
  { player_id: 2, division: 2, name: "B Wing", team_name: "South", games: 18, ppg: 25, ppg_rank: 1 },
  { player_id: 3, division: 2, name: "C Center", team_name: "North", games: 4, ppg: 40, ppg_rank: 2 },
  { player_id: 4, division: 3, name: "D Guard", team_name: "Other", games: 20, ppg: 30, ppg_rank: 1 },
  { player_id: 5, division: 2, name: "E Guard", team_name: "North", games: 20, ppg: null, ppg_rank: null },
];

describe("division player rankings", () => {
  it("exposes recorded defensive and context fields in the metric catalog", () => {
    expect(divisionMetricLabel("spg")).toBe("Steals per game");
    expect(divisionMetricLabel("bpg")).toBe("Blocks per game");
    expect(divisionMetricLabel("ast_to")).toBe("Assist-to-turnover ratio");
    expect(divisionMetricLabel("dbl_dbl")).toBe("Double-doubles");
    expect(divisionMetricLabel("pts")).toBe("Recorded total points");
    expect(divisionMetricLabel("fga")).toBe("Recorded field-goal attempts");
    expect(divisionMetricLabel("o_poss")).toBe("Recorded offensive possessions");
  });
  it("filters to the requested division and keeps source rank separate from local rank", () => {
    const result = rankDivisionPlayers(players, { division: "2", metric: "ppg", minGames: 5 });
    expect(result.total).toBe(2);
    expect(result.rows.map((row) => [row.rank, row.name, row.value, row.source_rank])).toEqual([
      [1, "B Wing", 25, 1],
      [2, "A Guard", 22, 3],
    ]);
  });

  it("does not turn missing values into zero and applies a bounded search", () => {
    const result = rankDivisionPlayers(players, { division: "2", metric: "ppg", query: "north", minGames: 0, limit: 1 });
    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("C Center");
    expect(divisionMetricValue(players[4], "ppg")).toBeNull();
  });

  it("orders denominator-free source measures only when the source recorded them", () => {
    const result = rankDivisionPlayers([
      { player_id: 1, division: 3, name: "No Rebounds", games: 20, rpg: null },
      { player_id: 2, division: 3, name: "Recorded Rebounds", games: 20, rpg: 10 },
    ], { division: "3", metric: "rpg" });
    expect(result.total).toBe(1);
    expect(result.rows[0].name).toBe("Recorded Rebounds");
  });

  it("ranks retained lower-division totals without converting missing fields to zero", () => {
    const result = rankDivisionPlayers([
      { player_id: 1, division: 2, name: "Volume Leader", games: 20, pts: 500, fga: 400 },
      { player_id: 2, division: 2, name: "Missing Attempts", games: 20, pts: 450, fga: null },
      { player_id: 3, division: 3, name: "Other Division", games: 20, pts: 900, fga: 700 },
    ], { division: "2", metric: "fga" });
    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({ name: "Volume Leader", value: 400, rank: 1 });
  });
});
