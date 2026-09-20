import { describe, expect, it } from "vitest";
import {
  filterWomensSourceTeams,
  formatWomensTeamStat,
  womensTeamMetrics,
  type WomensSourceTeam,
} from "./womens-team-table";

const teams: WomensSourceTeam[] = [
  {
    team_id: "1",
    team: "Alpha",
    abbreviation: "ALP",
    stats: { gamesPlayed: 20, avgPoints: 72.5, fieldGoalPct: 48.25 },
    stat_metadata: {
      gamesPlayed: { label: "GP", name: "Games Played", description: "Games" },
      avgPoints: { label: "PPG", name: "Points Per Game", description: "Points" },
      fieldGoalPct: { label: "FG%", name: "Field Goal Percentage", description: "Percentage" },
    },
  },
  {
    team_id: "2",
    team: "Beta",
    abbreviation: "BET",
    stats: { gamesPlayed: 3, avgPoints: 90, fieldGoalPct: null },
    stat_metadata: {
      gamesPlayed: { label: "GP", name: "Games Played" },
      avgPoints: { label: "PPG", name: "Points Per Game" },
      fieldGoalPct: { label: "FG%", name: "Field Goal Percentage" },
    },
  },
];

describe("women's source team table helpers", () => {
  it("keeps every populated source metric and sorts it by display label", () => {
    expect(womensTeamMetrics(teams).map((metric) => metric.key)).toEqual(["fieldGoalPct", "gamesPlayed", "avgPoints"]);
  });

  it("filters by a recorded game threshold and never ranks a missing metric", () => {
    expect(filterWomensSourceTeams(teams, "", "avgPoints", 5).map((team) => team.team)).toEqual(["Alpha"]);
    expect(filterWomensSourceTeams(teams, "Beta", "fieldGoalPct")).toEqual([]);
  });

  it("formats recorded percentages and rates without implying missing values are zero", () => {
    const metrics = womensTeamMetrics(teams);
    expect(formatWomensTeamStat(48.25, metrics.find((metric) => metric.key === "fieldGoalPct"))).toBe("48.3%");
    expect(formatWomensTeamStat(null, metrics.find((metric) => metric.key === "avgPoints"))).toBe("—");
  });
});
