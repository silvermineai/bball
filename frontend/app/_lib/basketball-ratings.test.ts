import { describe, expect, it } from "vitest";
import { sortTeamRatings } from "./basketball-ratings";
import type { BBTeam } from "./basketball-types";

const team = (id: string, name: string, efg: number | null, tov_rate: number): BBTeam => ({
  id,
  name,
  rank: Number(id),
  adj_off: 110,
  adj_def: 95,
  adj_net: 15,
  adj_tempo: 70,
  games: 20,
  wins: 15,
  sos: null,
  sos_games: 0,
  efg,
  tov_rate,
  orb_rate: null,
  ft_rate: null,
  three_rate: null,
});

describe("basketball rating sorting", () => {
  it("sorts higher-is-better factors and leaves missing values last", () => {
    const rows = sortTeamRatings(
      [team("2", "Beta", null, 0.15), team("1", "Alpha", 0.58, 0.16)],
      "efg",
    );
    expect(rows.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
  });

  it("sorts turnover rate in the coaching direction", () => {
    const rows = sortTeamRatings(
      [team("1", "Alpha", 0.55, 0.18), team("2", "Beta", 0.55, 0.12)],
      "tov_rate",
    );
    expect(rows.map((r) => r.name)).toEqual(["Beta", "Alpha"]);
  });
});
