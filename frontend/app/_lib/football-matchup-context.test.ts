import { describe, expect, it } from "vitest";
import { footballMatchupContextRows } from "./football-matchup-context";
import type { FootballRecruitingTeam } from "./football-recruiting-context";

const team = (overrides: Partial<FootballRecruitingTeam>): FootballRecruitingTeam => ({
  team_id: "1",
  team: "Example",
  talent_composite: null,
  talent_rank: null,
  blue_chip_ratio: null,
  n_recruits: null,
  off_returning: null,
  def_returning: null,
  overall_returning: null,
  n_returning: null,
  returning_estimated: null,
  ...overrides,
});

describe("football matchup context", () => {
  it("compares exact-team personnel fields with metric-aware direction", () => {
    const rows = footballMatchupContextRows(
      team({ team_id: "10", talent_composite: 85, talent_rank: 12, overall_returning: 0.62 }),
      team({ team_id: "20", talent_composite: 90, talent_rank: 18, overall_returning: 0.62 }),
    );
    expect(rows.find((row) => row.key === "talent_composite")).toMatchObject({ away: 85, home: 90, edge: "home", direction: "higher" });
    expect(rows.find((row) => row.key === "talent_rank")).toMatchObject({ away: 12, home: 18, edge: "away", direction: "lower" });
    expect(rows.find((row) => row.key === "overall_returning")).toMatchObject({ away: 0.62, home: 0.62, edge: "even" });
  });

  it("withholds a comparison when either exact team record is unavailable", () => {
    const row = footballMatchupContextRows(team({ talent_composite: 85 }), undefined)
      .find((candidate) => candidate.key === "talent_composite");
    expect(row).toMatchObject({ away: 85, home: null, edge: "unavailable" });
  });
});
