import { describe, expect, it } from "vitest";
import { findSimilarPlayers } from "./player-similarity";
import type { BBPlayer } from "./basketball-types";

const player = (overrides: Partial<BBPlayer>): BBPlayer => ({
  id: "target",
  team_id: "1",
  name: "Target",
  team: "Alpha",
  position: "G",
  season: 2026,
  games: 30,
  minutes: 900,
  mpg: 30,
  ppg: 18,
  rpg: 5,
  orpg: 1,
  drpg: 4,
  apg: 6,
  spg: 1.5,
  bpg: 0.3,
  fpg: 2,
  topg: 2,
  efg: 0.55,
  ts: 0.6,
  three_pct: 0.36,
  ft_rate: 0.25,
  three_rate: 0.4,
  tov_rate: 0.15,
  qualified: true,
  incomplete_box_games: 0,
  ...overrides,
});

describe("findSimilarPlayers", () => {
  it("ranks the closest source profile and excludes the target", () => {
    const target = player({});
    const close = player({ id: "close", name: "Close", team_id: "2", team: "Beta", ppg: 18.2, apg: 5.8 });
    const distant = player({ id: "distant", name: "Distant", team_id: "3", team: "Gamma", ppg: 4, apg: 1, rpg: 1, ts: 0.35, efg: 0.3, mpg: 8 });
    expect(findSimilarPlayers(target, [target, close, distant], 2).map((row) => row.id)).toEqual(["close", "distant"]);
    expect(findSimilarPlayers(target, [target], 5)).toEqual([]);
  });

  it("keeps sparse comparisons out of the similarity board", () => {
    const target = player({});
    const sparse = player({ id: "sparse", ppg: null, rpg: null, apg: null, spg: null, bpg: null, ts: null, efg: null });
    expect(findSimilarPlayers(target, [target, sparse])).toEqual([]);
  });
});
