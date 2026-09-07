import { describe, expect, it } from "vitest";
import {
  ncaaFilterSearch,
  ncaaValueCoverage,
  parseNCAAFilters,
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
  fgm: null,
  fga: null,
  three_fgm: null,
  three_fga: null,
  ftm: null,
  ppg_rank: null,
  rpg_rank: null,
  apg_rank: null,
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
});
