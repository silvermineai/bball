import { describe, expect, it } from "vitest";
import {
  filterWomensSourceTeams,
  formatWomensTeamStat,
  womensTeamMetricValue,
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
  {
    team_id: "3",
    team: "Gamma",
    abbreviation: "GAM",
    stats: {
      gamesPlayed: 12,
      fieldGoalsMade: 50,
      fieldGoalsAttempted: 100,
      threePointFieldGoalsMade: 20,
      threePointFieldGoalsAttempted: 40,
      points: 150,
      freeThrowsAttempted: 30,
    },
    stat_metadata: {
      gamesPlayed: { label: "GP", name: "Games Played" },
      fieldGoalsMade: { label: "FGM", name: "Field Goals Made" },
    },
  },
];

describe("women's source team table helpers", () => {
  it("keeps every populated source metric and sorts it by display label", () => {
    expect(womensTeamMetrics(teams.slice(0, 2)).map((metric) => metric.key)).toEqual(["fieldGoalPct", "gamesPlayed", "avgPoints"]);
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

  it("derives transparent shot-profile rates from retained totals", () => {
    const gamma = teams[2];
    const metrics = womensTeamMetrics(teams).map((metric) => metric.key);
    expect(metrics).toEqual(expect.arrayContaining([
      "effectiveFieldGoalPct",
      "fieldGoalsMade",
      "freeThrowRate",
      "threePointAttemptRate",
      "trueShootingPct",
    ]));
    expect(womensTeamMetricValue(gamma, "effectiveFieldGoalPct")).toBe(60);
    expect(womensTeamMetricValue(gamma, "trueShootingPct")).toBeCloseTo(65.6455, 3);
    expect(womensTeamMetricValue(gamma, "threePointAttemptRate")).toBe(40);
    expect(womensTeamMetricValue(gamma, "freeThrowRate")).toBe(30);
    expect(formatWomensTeamStat(40, womensTeamMetrics(teams).find((metric) => metric.key === "threePointAttemptRate"))).toBe("40.0%");
  });

  it("ranks derived values and excludes teams without a valid denominator", () => {
    expect(filterWomensSourceTeams(teams, "", "freeThrowRate").map((team) => team.team)).toEqual(["Gamma"]);
    expect(womensTeamMetricValue(teams[0], "freeThrowRate")).toBeNull();
  });
});
