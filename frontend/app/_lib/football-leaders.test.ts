import { describe, expect, it } from "vitest";
import { topFootballLeaders, topFootballSourceBoxLeaders, type LeaderPlayer } from "./football-leaders";

const players: LeaderPlayer[] = [
  {
    id: "a",
    name: "First",
    team: "Alpha",
    conference: "North",
    division: "fbs",
    production: {
      passing: {
        rank: 4,
        plays: 200,
        yards: 1500,
        touchdowns: 12,
        epa: 30,
        epa_per_play: 0.15,
      },
    },
  },
  {
    id: "b",
    name: "Second",
    team: "Beta",
    conference: "South",
    division: "fbs",
    production: {
      passing: {
        rank: 2,
        plays: 220,
        yards: 1700,
        touchdowns: 15,
        epa: 40,
        epa_per_play: 0.18,
      },
    },
  },
  {
    id: "c",
    name: "Unranked",
    team: "Gamma",
    conference: "West",
    division: "fbs",
    production: {
      passing: {
        rank: null,
        plays: 50,
        yards: 400,
        touchdowns: 2,
        epa: -1,
        epa_per_play: -0.02,
      },
    },
  },
];

describe("football leaderboards", () => {
  it("keeps only ranked source rows and preserves rank order", () => {
    const result = topFootballLeaders(players, "passing", 2);
    expect(result.map((p) => p.name)).toEqual(["Second", "First"]);
    expect(result[0].category).toBe("passing");
    expect(result).toHaveLength(2);
  });

  it("returns an empty board for unavailable categories", () => {
    expect(topFootballLeaders(players, "rushing")).toEqual([]);
  });

  it("ranks one exact-ID source-box metric and shares tied ranks", () => {
    const result = topFootballSourceBoxLeaders([
      { id: "a", name: "First", team: "Alpha", team_id: "1", conference: "North", division: "fbs", production: { defensive: { metrics: { tackles: 12 } } } },
      { id: "b", name: "Second", team: "Beta", team_id: "2", conference: "South", division: "fbs", production: { defensive: { metrics: { tackles: 12 } } } },
      { id: "c", name: "Third", team: "Gamma", team_id: "3", conference: "West", division: "fbs", production: { defensive: { metrics: { tackles: 8 } } } },
    ], "defensive", "tackles", 3);
    expect(result.map((row) => [row.name, row.value, row.rank])).toEqual([
      ["First", 12, 1], ["Second", 12, 1], ["Third", 8, 3],
    ]);
  });

  it("does not rank absent or non-finite source fields", () => {
    expect(topFootballSourceBoxLeaders([
      { id: "a", name: "Missing", team: "Alpha", conference: "North", division: "fbs", production: { punting: { metrics: {} } } },
      { id: "b", name: "Invalid", team: "Beta", conference: "South", division: "fbs", production: { punting: { metrics: { punts: Number.NaN } } } },
    ], "punting", "punts")).toEqual([]);
  });
});
