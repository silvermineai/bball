import { describe, expect, it } from "vitest";
import { aggregateLowerFootballPlayers, lowerFootballSourceFields, lowerFootballSourceRows } from "./football-lower-player-view";

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

  it("returns only the exact player, team, division, and category source rows", () => {
    const selected = row({ game_id: "g1", date: "2026-09-02T00:00:00Z", labels: ["C/ATT", "YDS"] });
    const later = row({ game_id: "g2", date: "2026-09-09T00:00:00Z" });
    expect(lowerFootballSourceRows([
      selected,
      later,
      row({ athlete_id: "a1", team_id: "other-team", game_id: "wrong-team" }),
      row({ athlete_id: "a1", division: "d3", game_id: "wrong-division" }),
      row({ athlete_id: "a1", category: "rushing", game_id: "wrong-category" }),
      row({ athlete_id: "a2", game_id: "wrong-player" }),
    ], "d2", "passing", "a1", "t1")).toEqual([later, selected]);
  });

  it("preserves provider labels and missing values without filling them", () => {
    expect(lowerFootballSourceFields(row({ keys: ["yards", "touchdowns", "unused"], labels: ["YDS", "TD"], stats: ["200", "", "—"] }))).toEqual([
      { key: "yards", label: "YDS", value: "200" },
      { key: "touchdowns", label: "TD", value: null },
      { key: "unused", label: "unused", value: "—" },
    ]);
  });
});
