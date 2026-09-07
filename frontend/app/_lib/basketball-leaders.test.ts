import { describe, expect, it } from "vitest";
import { topBasketballLeaders, type BasketballLeaderPlayer } from "./basketball-leaders";

const player = (
  id: string,
  name: string,
  ppg: number | null,
  qualified = true,
): BasketballLeaderPlayer => ({
  id,
  name,
  team: "Program",
  position: "G",
  games: 20,
  minutes: 500,
  ppg,
  rpg: 4,
  apg: 3,
  ts: 0.6,
  qualified,
});

describe("basketball production leaderboards", () => {
  it("ranks qualified players and preserves tied ranks", () => {
    const rows = topBasketballLeaders(
      [player("a", "Alpha", 20), player("b", "Beta", 20), player("c", "Gamma", 18)],
      "ppg",
    );
    expect(rows.map((r) => [r.name, r.rank])).toEqual([
      ["Alpha", 1],
      ["Beta", 1],
      ["Gamma", 3],
    ]);
  });

  it("keeps incomplete samples out of the board", () => {
    expect(
      topBasketballLeaders(
        [player("a", "Unqualified", 40, false), player("b", "Missing", null)],
        "ppg",
      ),
    ).toEqual([]);
  });
});
