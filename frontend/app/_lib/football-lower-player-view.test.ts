import { describe, expect, it } from "vitest";
import { aggregateLowerFootballPlayers } from "./football-lower-player-view";

const row = (overrides: Record<string, unknown> = {}) => ({
  season: 2026,
  division: "d2" as const,
  game_id: "g1",
  team_id: "t1",
  team: "Example State",
  athlete_id: "a1",
  athlete: "A Player",
  position: "QB",
  category: "passing",
  keys: ["completions/passingAttempts", "passingYards", "passingTouchdowns"],
  stats: ["10/20", "200", "2"],
  ...overrides,
});

describe("lower football player aggregation", () => {
  it("aggregates exact athlete and team identities across games", () => {
    const result = aggregateLowerFootballPlayers([
      row(),
      row({ game_id: "g2", stats: ["5/10", "100", "1"] }),
      row({ athlete_id: "a2", athlete: "Other QB", stats: ["20/20", "50", "0"] }),
    ], "d2", "passing");
    expect(result[0]).toMatchObject({ athlete_id: "a1", games: 2, source_rows: 2, primary: 300, metrics: { passingYards: 300, passingTouchdowns: 3 } });
    expect(result).toHaveLength(2);
  });

  it("fails closed across divisions and categories", () => {
    expect(aggregateLowerFootballPlayers([row({ division: "d3" })], "d2", "passing")).toEqual([]);
    expect(aggregateLowerFootballPlayers([row()], "d2", "rushing")).toEqual([]);
  });
});
