import { describe, expect, it } from "vitest";
import {
  footballEventDataset,
  footballPlayerFilterSearch,
  hasRankedProduction,
  parseFootballPlayerFilters,
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
  it("hands off name-attributed event categories to their source notebooks", () => {
    expect(footballEventDataset("defensive")).toBe("defense");
    expect(footballEventDataset("interceptions")).toBe("defense");
    expect(footballEventDataset("puntReturns")).toBe("specialists");
    expect(footballEventDataset("passing")).toBeNull();
    expect(footballEventDataset("all")).toBeNull();
  });
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

describe("football player board URL state", () => {
  const seasons = [2026, 2025, 2024];

  it("parses supported filters and keeps the exact search query", () => {
    expect(
      parseFootballPlayerFilters(
        "?season=2024&category=receiving&division=all&q=Smith%20Jr.&qualified=1&page=3",
        seasons,
      ),
    ).toEqual({
      season: "2024",
      category: "receiving",
      division: "all",
      query: "Smith Jr.",
      qualified: true,
      page: 3,
    });
  });

  it("falls back to the current catalog and safe defaults for invalid state", () => {
    expect(
      parseFootballPlayerFilters(
        "?season=1999&category=not-a-stat&division=other&page=-2",
        seasons,
      ),
    ).toEqual({
      season: "2025",
      category: "passing",
      division: "fbs",
      query: "",
      qualified: false,
      page: 0,
    });
  });

  it("serializes only non-default controls for shareable links", () => {
    expect(
      footballPlayerFilterSearch({
        season: "2024",
        category: "receiving",
        division: "all",
        query: "Smith Jr.",
        qualified: true,
        page: 3,
      }),
    ).toBe("?season=2024&category=receiving&division=all&q=Smith+Jr.&qualified=1&page=3");
    expect(
      footballPlayerFilterSearch({
        season: "2025",
        category: "passing",
        division: "fbs",
        query: "",
        qualified: false,
        page: 0,
      }),
    ).toBe("");
  });
});
