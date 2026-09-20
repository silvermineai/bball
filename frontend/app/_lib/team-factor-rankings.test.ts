import { describe, expect, it } from "vitest";
import { rankTeamFactorRows, teamFactorDefinition, type TeamFactorKey } from "./team-factor-rankings";
import type { BBTeam } from "./basketball-types";

const team = (id: string, value: Partial<BBTeam>): BBTeam => ({
  id, name: id, rank: Number(id), adj_off: 110, adj_def: 95, adj_net: 15, adj_tempo: 68, games: 20, wins: 15,
  expected_wins: 14, luck: 0, luck_games: 20, sos: 5, sos_games: 20, efg: 0.52, tov_rate: 0.16, orb_rate: 0.3, ft_rate: 0.2, three_rate: 0.4,
  ...value,
});

describe("adjusted team factor rankings", () => {
  it("ranks offense high first and calculates a favorable percentile", () => {
    const rows = rankTeamFactorRows([
      team("1", { adj_off_efg: 0.58 }), team("2", { adj_off_efg: 0.52 }), team("3", { adj_off_efg: 0.48 }),
    ], "adj_off_efg");
    expect(rows.map((row) => [row.team.id, row.rank, row.percentile])).toEqual([["1", 1, 100], ["2", 2, 50], ["3", 3, 0]]);
  });

  it("reverses defensive turnover direction and keeps null fields out", () => {
    const rows = rankTeamFactorRows([
      team("1", { adj_def_tov: 0.19 }), team("2", { adj_def_tov: 0.12 }), team("3", { adj_def_tov: null }),
    ], "adj_def_tov");
    expect(rows.map((row) => row.team.id)).toEqual(["2", "1"]);
    expect(rows).toHaveLength(2);
    expect(teamFactorDefinition("adj_def_tov").higherIsBetter).toBe(false);
  });

  it("shares a competition rank for exact ties", () => {
    const key: TeamFactorKey = "adj_off_orb";
    const rows = rankTeamFactorRows([team("1", { [key]: 0.3 }), team("2", { [key]: 0.3 }), team("3", { [key]: 0.2 })], key);
    expect(rows.map((row) => row.rank)).toEqual([1, 1, 3]);
  });
});
