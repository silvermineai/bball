import { describe, expect, it } from "vitest";
import { sortImpactRows } from "./basketball-impact";
import type { BBImpact } from "./basketball-types";

const row = (id: string, player: string, net: number | null, rank: number | null): BBImpact => ({
  player_id: id,
  person_id: `person-${id}`,
  player,
  team: "Program",
  orapm: net,
  drapm: 0,
  rapm_net: net,
  off_poss: 1000,
  def_poss: 1000,
  qualified: rank !== null,
  rank,
});

describe("basketball impact sorting", () => {
  it("sorts metric leaders first and uses source rank as the tie break", () => {
    const rows = sortImpactRows(
      [row("c", "Gamma", 8, 3), row("a", "Alpha", 10, 1), row("b", "Beta", 10, 2)],
      "rapm_net",
    );
    expect(rows.map((r) => r.player)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("keeps missing values after observed values", () => {
    const rows = sortImpactRows([row("missing", "Missing", null, null), row("a", "Alpha", 1, 1)], "orapm");
    expect(rows.map((r) => r.player)).toEqual(["Alpha", "Missing"]);
  });
});
