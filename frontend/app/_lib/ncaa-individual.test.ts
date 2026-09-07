import { describe, expect, it } from "vitest";
import { sortNCAAPlayers, type NCAAIndividualPlayer } from "./ncaa-individual";

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
});
