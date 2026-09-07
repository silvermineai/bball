import { describe, expect, it } from "vitest";
import {
  hasRankedProduction,
  productionForCategory,
  type FootballPlayerProduction,
} from "./football-player-view";

const row = (rank: number | null, plays: number): FootballPlayerProduction => ({
  categories: ["defensive", "receiving", "rushing"],
  production: {
    receiving: {
      rank,
      plays,
      yards: 10,
      epa: 1,
      epa_per_play: 0.1,
      touchdowns: 1,
    },
    rushing: {
      rank: rank === null ? null : rank + 2,
      plays: plays + 20,
      yards: 30,
      epa: 2,
      epa_per_play: 0.05,
      touchdowns: 2,
    },
  },
});

describe("football player index category selection", () => {
  it("uses the best ranked category for the all-players view", () => {
    const selected = productionForCategory(row(12, 40), "all");
    expect(selected?.category).toBe("receiving");
    expect(selected?.stats.rank).toBe(12);
    expect(hasRankedProduction(row(12, 40), "all")).toBe(true);
  });

  it("falls back to workload when the source has no rank", () => {
    const selected = productionForCategory(row(null, 40), "all");
    expect(selected?.category).toBe("rushing");
    expect(selected?.stats.plays).toBe(60);
    expect(hasRankedProduction(row(null, 40), "all")).toBe(false);
  });

  it("does not invent a row for defensive-only records", () => {
    const player: FootballPlayerProduction = {
      categories: ["defensive", "interceptions"],
      production: {},
    };
    expect(productionForCategory(player, "all")).toBeNull();
    expect(productionForCategory(player, "defensive")).toBeNull();
  });
});
