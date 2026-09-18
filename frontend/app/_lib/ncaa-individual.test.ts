import { describe, expect, it } from "vitest";
import {
  ncaaFilterSearch,
  ncaaLeaderCsvRows,
  ncaaValueCoverage,
  parseNCAAFilters,
  publisherRank,
  sortNCAAPlayers,
  type NCAAIndividualPlayer,
} from "./ncaa-individual";

const player = (name: string, ppg: number | null, division: 1 | 2 | 3 = 1): NCAAIndividualPlayer => ({
  player_id: name.length,
  division,
  name,
  team_name: "Test",
  team_ncaa_id: null,
  conference: null,
  class_year: null,
  height: null,
  position: null,
  games: 20,
  ppg,
  rpg: null,
  apg: null,
  spg: null,
  bpg: null,
  fg_pct: null,
  three_pct: null,
  ft_pct: null,
  threes_pg: null,
  mpg: null,
  ast_to: null,
  dbl_dbl: null,
  pts: null,
  reb: null,
  ast: null,
  stl: null,
  blk: null,
  tov: null,
  fgm: null,
  fga: null,
  three_fgm: null,
  three_fga: null,
  ftm: null,
  fta: null,
  ppg_rank: null,
  rpg_rank: null,
  apg_rank: null,
  spg_rank: null,
  bpg_rank: null,
  fg_pct_rank: null,
  three_pct_rank: null,
  ft_pct_rank: null,
  threes_pg_rank: null,
  mpg_rank: null,
  ast_to_rank: null,
  dbl_dbl_rank: null,
});

describe("NCAA individual leader sorting", () => {
  it("sorts values descending, leaves missing values last, and does not mutate", () => {
    const rows = [player("Missing", null), player("Ava", 20), player("Ben", 20), player("Cal", 25)];
    const sorted = sortNCAAPlayers(rows, "ppg");
    expect(sorted.map((p) => p.name)).toEqual(["Cal", "Ava", "Ben", "Missing"]);
    expect(rows[0].name).toBe("Missing");
  });

  it("counts only published values by division", () => {
    const rows = [player("D1", 20, 1), player("D2", null, 2), player("D3", 11, 3)];
    expect(ncaaValueCoverage(rows, ["ppg"])).toEqual([
      { stat: "ppg", divisions: { 1: 1, 2: 0, 3: 1 } },
    ]);
  });

  it("supports source total leaderboards alongside rates", () => {
    const rows = [
      { ...player("Low", 10), pts: 400 },
      { ...player("High", 10), pts: 700 },
    ];
    expect(sortNCAAPlayers(rows, "pts").map((p) => p.name)).toEqual([
      "High",
      "Low",
    ]);
  });

  it("supports the complete retained defensive and attempt totals", () => {
    const rows = [
      { ...player("Low", 10), stl: 4, blk: 2, tov: 90, fta: 40 },
      { ...player("High", 10), stl: 12, blk: 8, tov: 30, fta: 80 },
    ];
    expect(sortNCAAPlayers(rows, "stl").map((p) => p.name)).toEqual(["High", "Low"]);
    expect(sortNCAAPlayers(rows, "fta").map((p) => p.name)).toEqual(["High", "Low"]);
  });

  it("round-trips shareable division, stat and name filters", () => {
    const filters = parseNCAAFilters(
      "?division=2&stat=three_fgm&q=Jordan%20Smith",
    );
    expect(filters).toEqual({
      division: "2",
      stat: "three_fgm",
      query: "Jordan Smith",
    });
    expect(ncaaFilterSearch(filters)).toBe(
      "?division=2&stat=three_fgm&q=Jordan+Smith",
    );
  });

  it("withholds invalid NCAA controls and omits defaults", () => {
    expect(parseNCAAFilters("?division=5&stat=made_up&q=")).toEqual({
      division: "1",
      stat: "ppg",
      query: "",
    });
    expect(ncaaFilterSearch({ division: "1", stat: "ppg", query: "" })).toBe("");
  });

  it("only reports rank fields that the source actually publishes", () => {
    const row = { ...player("Ranked", 20), ppg_rank: 17, pts: 900 };
    expect(publisherRank(row, "ppg")).toBe(17);
    expect(publisherRank(row, "pts")).toBeNull();
    expect(publisherRank({ ...row, fg_pct_rank: 42 }, "fg_pct")).toBe(42);
    expect(publisherRank({ ...row, ast_to_rank: 9 }, "ast_to")).toBe(9);
  });

  it("exports the complete retained stat line with stable view order", () => {
    const row = { ...player("Ranked", 20), ppg_rank: 17, rpg: 8, pts: 400, fta: 60, source_stats: { ppg: { headers: ["PPG"], cells: ["20"], rank: 17, value: 20 } } };
    const values = ncaaLeaderCsvRows([row], "ppg", 40)[0];
    expect(values.slice(0, 6)).toEqual([41, 17, "Ranked", row.player_id, "Test", 1]);
    expect(values[10]).toBe(20);
    expect(values[11]).toBe(8);
    expect(values[37]).toBe(60);
    expect(values[39]).toContain('"ppg"');
  });
});
