import { describe, expect, it } from "vitest";
import { exactRankingContextRows, rankingContextLabel, rankingRoleContext, type RankingContextRow } from "./ncaa-ranking-context";

const row = (overrides: Partial<RankingContextRow> = {}): RankingContextRow => ({
  season: 2026,
  metric: "poss_share",
  player_id: "42",
  team_id: "7",
  team_name: "Example",
  player_name: "Guard",
  games: 20,
  minutes: 600,
  possessions: 240,
  team_possessions: 800,
  fga: 200,
  value: 30,
  rank: 4,
  total: 100,
  ...overrides,
});

describe("NCAA comparison ranking context", () => {
  it("requires exact IDs and retains separate exact-ID team stints", () => {
    const rows = exactRankingContextRows([
      row(),
      row({ team_id: "8", team_name: "Second" }),
      row({ player_id: "420" }),
      row(),
    ], "42");
    expect(rows.map((value) => value.team_id)).toEqual(["7", "8"]);
  });

  it("shows role workload only when its denominator is valid", () => {
    expect(rankingRoleContext(row())).toBe("MPG 30.0 · Role load 30.0% (240 / 800 poss) · FGA 200");
    expect(rankingRoleContext(row({ team_possessions: 0 }))).toBe("MPG 30.0 · FGA 200");
    expect(rankingRoleContext(row({ possessions: 900 }))).toBe("MPG 30.0 · FGA 200");
  });

  it("keeps the qualified cohort and board label in the context line", () => {
    expect(rankingContextLabel({ metric: "poss_share", label: "Role load", minGames: 5, minMinutes: 200, minVolume: 0, description: "role" }, row())).toBe("Role load: 30.0% · #4 of 100");
  });
});
