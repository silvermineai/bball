import { describe, expect, it } from "vitest";
import {
  footballEventDataset,
  footballFcsRankingBasis,
  footballCohortPercentile,
  footballCohortPercentiles,
  computeFcsEpaRanks,
  computeProvisionalProductionRanks,
  computeSourceBoxRanks,
  footballPlayerRankKey,
  compareFootballPlayers,
  footballPlayerFilterSearch,
  hasRankedProduction,
  footballSourceBoxMetric,
  parseFootballPlayerFilters,
  parseFootballPlayerScope,
  productionForCategory,
  type FootballPlayerProduction,
  type FootballRankablePlayer,
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

describe("football player index scope boundary", () => {
  it("reads shared gender and D1/D2/D3 scope before native FBS controls", () => {
    expect(parseFootballPlayerScope("?gender=women&division=3")).toEqual({ gender: "women", division: "3" });
    expect(parseFootballPlayerScope("?gender=men&division=1")).toEqual({ gender: "men", division: "1" });
    expect(parseFootballPlayerScope("?division=all")).toEqual({ gender: "men", division: "1" });
  });
});

describe("football player index category selection", () => {
  it("compares only exact player/team rows with an available category", () => {
    const players: FootballRankablePlayer[] = [
      { id: "1", team_id: "a", name: "Alpha", division: "fbs", categories: ["passing"], production: { passing: { plays: 100, yards: 1000, epa: 20, epa_per_play: 0.2, touchdowns: 8, rank: 1 } } },
      { id: "1", team_id: "b", name: "Alpha transfer", division: "fbs", categories: ["rushing"], production: { rushing: { plays: 50, yards: 300, epa: 4, epa_per_play: 0.08, touchdowns: 3, rank: null } } },
      { id: "2", team_id: "c", name: "Beta", division: "fbs", categories: ["receiving"], production: { receiving: { plays: 30, yards: 400, epa: 7, epa_per_play: 0.23, touchdowns: 4, rank: 2 } } },
    ];
    expect(compareFootballPlayers(players, ["1:a", "1:b", "2:c", "missing:x"], "passing")).toEqual([
      expect.objectContaining({ id: "1", team_id: "a", selectedCategory: "passing", stats: expect.objectContaining({ yards: 1000 }) }),
    ]);
    expect(compareFootballPlayers(players, ["1:b", "2:c"], "all").map((row) => row.selectedCategory)).toEqual(["rushing", "receiving"]);
  });
  it("keeps the publisher rank attached to each exact comparison row", () => {
    const players: FootballRankablePlayer[] = [
      { id: "7", team_id: "z", name: "Ranked Player", division: "fbs", categories: ["passing"], production: { passing: { plays: 120, yards: 1400, epa: 18, epa_per_play: 0.15, touchdowns: 10, rank: 4 } } },
      { id: "8", team_id: "y", name: "Unranked Player", division: "fbs", categories: ["passing"], production: { passing: { plays: 90, yards: 900, epa: 8, epa_per_play: 0.09, touchdowns: 6, rank: null } } },
    ];
    const compared = compareFootballPlayers(players, ["7:z", "8:y"], "passing");
    expect(compared.map((row) => row.stats.rank)).toEqual([4, null]);
  });
  it("keeps efficiency percentiles descriptive and unavailable-safe", () => {
    expect(footballCohortPercentile(0.4, [0.1, 0.4, 0.4, null])).toBe(100);
    expect(footballCohortPercentile(0.1, [0.1, 0.4, 0.4, null])).toBe(33.3);
    expect(footballCohortPercentile(0.4, [0.1, 0.4], "lower")).toBe(50);
    expect(footballCohortPercentile(null, [0.1, 0.4])).toBeNull();
    expect(footballCohortPercentiles([0.4, 0.1, null, 0.4])).toEqual([100, 33.3, null, 100]);
  });

  it("hands off name-attributed event categories to their source notebooks", () => {
    expect(footballEventDataset("defensive")).toBe("defense");
    expect(footballEventDataset("interceptions")).toBe("defense");
    expect(footballEventDataset("puntReturns")).toBe("specialists");
    expect(footballEventDataset("passing")).toBeNull();
    expect(footballEventDataset("all")).toBeNull();
  });
  it("keeps exact-ID box totals rankable without inventing EPA", () => {
    expect(footballSourceBoxMetric("defensive")).toBe("tackles");
    expect(footballSourceBoxMetric("passing")).toBeNull();
    const ranks = computeSourceBoxRanks([
      { id: "2", team_id: "b", name: "Beta", division: "fbs", categories: ["defensive"], production: { defensive: { plays: null, yards: null, epa: null, epa_per_play: null, touchdowns: null, rank: null, source: "box", metrics: { tackles: 8 } } } },
      { id: "1", team_id: "a", name: "Alpha", division: "fbs", categories: ["defensive"], production: { defensive: { plays: null, yards: null, epa: null, epa_per_play: null, touchdowns: null, rank: null, source: "box", metrics: { tackles: 12 } } } },
    ], "defensive");
    expect(ranks.get(footballPlayerRankKey("1", "a", "defensive"))).toBe(1);
    expect(ranks.get(footballPlayerRankKey("2", "b", "defensive"))).toBe(2);
    const fcsRanks = computeSourceBoxRanks([
      { id: "3", team_id: "c", name: "FCS Leader", division: "fcs", categories: ["defensive"], production: { defensive: { plays: null, yards: null, epa: null, epa_per_play: null, touchdowns: null, rank: null, source: "box", metrics: { tackles: 99 } } } },
      { id: "4", team_id: "d", name: "FBS Row", division: "fbs", categories: ["defensive"], production: { defensive: { plays: null, yards: null, epa: null, epa_per_play: null, touchdowns: null, rank: null, source: "box", metrics: { tackles: 100 } } } },
    ], "defensive", "fcs");
    expect(fcsRanks.get(footballPlayerRankKey("3", "c", "defensive"))).toBe(1);
    expect(fcsRanks.has(footballPlayerRankKey("4", "d", "defensive"))).toBe(false);
  });
  it("gives equal source-box totals the same competition rank", () => {
    const ranks = computeSourceBoxRanks([
      { id: "1", team_id: "a", name: "Alpha", division: "fbs", categories: ["defensive"], production: { defensive: { plays: null, yards: null, epa: null, epa_per_play: null, touchdowns: null, rank: null, metrics: { tackles: 12 } } } },
      { id: "2", team_id: "b", name: "Beta", division: "fbs", categories: ["defensive"], production: { defensive: { plays: null, yards: null, epa: null, epa_per_play: null, touchdowns: null, rank: null, metrics: { tackles: 12 } } } },
      { id: "3", team_id: "c", name: "Gamma", division: "fbs", categories: ["defensive"], production: { defensive: { plays: null, yards: null, epa: null, epa_per_play: null, touchdowns: null, rank: null, metrics: { tackles: 10 } } } },
    ], "defensive", "fbs");
    expect(ranks.get(footballPlayerRankKey("1", "a", "defensive"))).toBe(1);
    expect(ranks.get(footballPlayerRankKey("2", "b", "defensive"))).toBe(1);
    expect(ranks.get(footballPlayerRankKey("3", "c", "defensive"))).toBe(3);
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

describe("football player division rankings", () => {
  it("provides a separate observed EPA order for an incomplete season", () => {
    const ranks = computeProvisionalProductionRanks(
      [
        { id: "2", team_id: "b", name: "Beta", division: "fbs", categories: ["passing"], production: { passing: { plays: 4, yards: 20, epa: 2, epa_per_play: 0.5, touchdowns: 0, rank: null } } },
        { id: "1", team_id: "a", name: "Alpha", division: "fbs", categories: ["passing"], production: { passing: { plays: 3, yards: 30, epa: 7, epa_per_play: 2.3, touchdowns: 1, rank: null } } },
        { id: "3", team_id: "c", name: "Missing EPA", division: "fbs", categories: ["passing"], production: { passing: { plays: 99, yards: 900, epa: null, epa_per_play: null, touchdowns: 9, rank: null } } },
      ],
      "passing",
      "fbs",
    );
    expect(ranks.get(footballPlayerRankKey("1", "a", "passing"))).toBe(1);
    expect(ranks.get(footballPlayerRankKey("2", "b", "passing"))).toBe(2);
    expect(ranks.has(footballPlayerRankKey("3", "c", "passing"))).toBe(false);
  });

  it("computes an explicit FCS EPA ordering without assigning a source rank", () => {
    const ranks = computeFcsEpaRanks(
      [
        { id: "2", team_id: "b", name: "Beta", division: "fcs", categories: ["rushing"], production: { rushing: { plays: 60, yards: 100, epa: 4, epa_per_play: 0.1, touchdowns: 1, rank: null } } },
        { id: "1", team_id: "a", name: "Alpha", division: "fcs", categories: ["rushing"], production: { rushing: { plays: 60, yards: 100, epa: 6, epa_per_play: 0.1, touchdowns: 1, rank: null } } },
        { id: "3", team_id: "c", name: "FBS row", division: "fbs", categories: ["rushing"], production: { rushing: { plays: 90, yards: 100, epa: 99, epa_per_play: 0.1, touchdowns: 1, rank: 1 } } },
      ],
      "rushing",
      { rushing: 50 },
    );
    expect(ranks.get(footballPlayerRankKey("1", "a", "rushing"))).toBe(1);
    expect(ranks.get(footballPlayerRankKey("2", "b", "rushing"))).toBe(2);
    expect(ranks.has(footballPlayerRankKey("3", "c", "rushing"))).toBe(false);
  });

  it("does not qualify an FCS row below the category play threshold", () => {
    const ranks = computeFcsEpaRanks([
      { id: "1", team_id: "a", name: "Short sample", division: "fcs", categories: ["passing"], production: { passing: { plays: 99, yards: 100, epa: 50, epa_per_play: 0.5, touchdowns: 1, rank: null } } },
    ], "passing", { passing: 100 });
    expect(ranks.size).toBe(0);
  });

  it("uses exact-ID source-box yards when an FCS EPA value is unavailable", () => {
    const players: FootballRankablePlayer[] = [
      { id: "1", team_id: "a", name: "Yard Leader", division: "fcs", categories: ["rushing"], production: { rushing: { plays: 60, yards: 500, epa: null, epa_per_play: null, touchdowns: 4, rank: null } } },
      { id: "2", team_id: "b", name: "Yard Two", division: "fcs", categories: ["rushing"], production: { rushing: { plays: 60, yards: 400, epa: null, epa_per_play: null, touchdowns: 3, rank: null } } },
    ];
    const ranks = computeFcsEpaRanks(players, "rushing", { rushing: 50 });
    expect(footballFcsRankingBasis(players, "rushing", { rushing: 50 })).toBe("source_box_yards");
    expect(ranks.get(footballPlayerRankKey("1", "a", "rushing"))).toBe(1);
    expect(ranks.get(footballPlayerRankKey("2", "b", "rushing"))).toBe(2);
  });

  it("never mixes FCS EPA and yardage in one ranking cohort", () => {
    const players: FootballRankablePlayer[] = [
      { id: "1", team_id: "a", name: "EPA Row", division: "fcs", categories: ["rushing"], production: { rushing: { plays: 60, yards: 100, epa: 4, epa_per_play: 0.1, touchdowns: 1, rank: null } } },
      { id: "2", team_id: "b", name: "Yards Only", division: "fcs", categories: ["rushing"], production: { rushing: { plays: 60, yards: 900, epa: null, epa_per_play: null, touchdowns: 8, rank: null } } },
    ];
    const ranks = computeFcsEpaRanks(players, "rushing", { rushing: 50 });
    expect(footballFcsRankingBasis(players, "rushing", { rushing: 50 })).toBe("total_epa");
    expect(ranks.get(footballPlayerRankKey("1", "a", "rushing"))).toBe(1);
    expect(ranks.has(footballPlayerRankKey("2", "b", "rushing"))).toBe(false);
  });

  it("uses competition ranks for equal FCS EPA and provisional EPA", () => {
    const players: FootballRankablePlayer[] = [
      { id: "1", team_id: "a", name: "Alpha", division: "fcs", categories: ["rushing"], production: { rushing: { plays: 60, yards: 100, epa: 4, epa_per_play: 0.1, touchdowns: 1, rank: null } } },
      { id: "2", team_id: "b", name: "Beta", division: "fcs", categories: ["rushing"], production: { rushing: { plays: 60, yards: 120, epa: 4, epa_per_play: 0.1, touchdowns: 1, rank: null } } },
      { id: "3", team_id: "c", name: "Gamma", division: "fcs", categories: ["rushing"], production: { rushing: { plays: 60, yards: 80, epa: 2, epa_per_play: 0.05, touchdowns: 0, rank: null } } },
    ];
    const fcs = computeFcsEpaRanks(players, "rushing", { rushing: 50 });
    const provisional = computeProvisionalProductionRanks(players, "rushing", "fcs");
    for (const ranks of [fcs, provisional]) {
      expect(ranks.get(footballPlayerRankKey("1", "a", "rushing"))).toBe(1);
      expect(ranks.get(footballPlayerRankKey("2", "b", "rushing"))).toBe(1);
      expect(ranks.get(footballPlayerRankKey("3", "c", "rushing"))).toBe(3);
    }
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
      sort: "rank",
      page: 3,
    });
  });

  it("keeps the retained FCS player archive selectable", () => {
    expect(parseFootballPlayerFilters("?division=fcs", seasons).division).toBe("fcs");
    expect(
      footballPlayerFilterSearch({
        season: "2025",
        category: "passing",
        division: "fcs",
        query: "",
        qualified: false,
        sort: "rank",
        page: 0,
      }),
    ).toBe("?division=fcs");
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
      sort: "rank",
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
        sort: "rank",
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
        sort: "rank",
        page: 0,
      }),
    ).toBe("");
  });

  it("preserves an efficiency ordering in shareable links", () => {
    expect(parseFootballPlayerFilters("?sort=success_rate", seasons).sort).toBe("success_rate");
    expect(parseFootballPlayerFilters("?sort=unknown", seasons).sort).toBe("rank");
    expect(
      footballPlayerFilterSearch({
        season: "2025",
        category: "passing",
        division: "fbs",
        query: "",
        qualified: false,
        sort: "yards_per_play",
        page: 0,
      }),
    ).toBe("?sort=yards_per_play");
  });
});
