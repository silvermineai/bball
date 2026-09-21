import { describe, expect, it } from "vitest";
import { rankWomensObservedPlayers } from "./womens-recruiting-intel";

const player = (overrides: Partial<Parameters<typeof rankWomensObservedPlayers>[0][number]> = {}) => ({
  player_id: "p-1",
  name: "A Player",
  team: "A College",
  position: "G",
  stats: { avgPoints: 18, avgRebounds: 4, avgAssists: 3, avgMinutes: 30 },
  ...overrides,
});

describe("women's recruiting production context", () => {
  it("sorts source rows by the selected production field and preserves missingness", () => {
    const rows = rankWomensObservedPlayers([
      player({ player_id: "p-2", name: "B Player", stats: { avgPoints: 22 } }),
      player({ player_id: "p-3", name: "C Player", stats: { avgPoints: null } }),
      player({ player_id: "p-1", name: "A Player", stats: { avgPoints: 18 } }),
    ], "avgPoints", 3);
    expect(rows.map((row) => [row.name, row.metricValue])).toEqual([
      ["B Player", 22],
      ["A Player", 18],
      ["C Player", null],
    ]);
  });

  it("uses a stable name and ID tie break without assigning a rank to a missing value", () => {
    const rows = rankWomensObservedPlayers([
      player({ player_id: "p-2", name: "Same Name", stats: { avgAssists: 5 } }),
      player({ player_id: "p-1", name: "Same Name", stats: { avgAssists: 5 } }),
      player({ player_id: "p-3", name: "Missing", stats: {} }),
    ], "avgAssists", 2);
    expect(rows.map((row) => row.player_id)).toEqual(["p-1", "p-2"]);
    expect(rankWomensObservedPlayers([player({ stats: {} })], "avgAssists")[0].metricValue).toBeNull();
  });
});
