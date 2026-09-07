import { describe, expect, it } from "vitest";
import { topFootballLeaders, type LeaderPlayer } from "./football-leaders";

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
});
