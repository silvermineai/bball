import { describe, expect, it } from "vitest";
import { combineTeamProduction, filterDivisionOneTeams, teamStatsUrl } from "./LiveTeamProductionTable";

describe("live team production filtering", () => {
  it("keeps only teams in the model's Division I cohort", () => {
    const rows = [
      { id: "d1", team: "D1 University", value: 90 },
      { id: "d2", team: "D2 College", value: 95 },
      { id: "d1b", team: "Another D1 University", value: 88 },
    ];
    expect(filterDivisionOneTeams(rows, new Set(["d1", "d1b"]))).toEqual([rows[0], rows[2]]);
  });

  it("joins the compact production fields by team ID", () => {
    const points = [{ id: "d1", team: "D1 University", value: 82 }];
    const stats = new Map([
      ["avgRebounds", new Map([["d1", { id: "d1", team: "D1 University", value: 36.5 }]])],
      ["avgAssists", new Map([["d1", { id: "d1", team: "D1 University", value: 14.2 }]])],
      ["fieldGoalPct", new Map([["d1", { id: "d1", team: "D1 University", value: 48.1 }]])],
      ["avgTurnovers", new Map([["d1", { id: "d1", team: "D1 University", value: 10.4 }]])],
    ]);
    expect(combineTeamProduction(points, stats)).toEqual([{
      ...points[0], rebounds: 36.5, assists: 14.2, fieldGoalPct: 48.1, turnovers: 10.4,
    }]);
  });

  it("keeps the live request tied to the dashboard's completed season", () => {
    expect(teamStatsUrl(2026, "offensive", "avgPoints", ["41", "99"])).toBe(
      "/api/basketball/research/team-stats?season=2026&category=offensive&stat=avgPoints&ids=41%2C99&limit=500&page=0",
    );
  });
});
