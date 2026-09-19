import { describe, expect, it } from "vitest";
import { filterLearningMetrics, type LearningMetric } from "./metric-explorer";

const metrics: LearningMetric[] = [
  { name: "Adjusted offense", value: "Points per 100 possessions", use: "Team scoring quality", topic: "team", href: "/basketball/ratings/" },
  { name: "True shooting", value: "Points per shot attempt", use: "Player scoring efficiency", topic: "player", href: "/basketball/players/" },
  { name: "Steals per game", value: "Recorded steals divided by games", use: "Defensive event production", topic: "player", href: "/basketball/ncaa-rankings/?metric=spg" },
  { name: "Blocks per game", value: "Recorded blocks divided by games", use: "Rim protection event production", topic: "player", href: "/basketball/ncaa-rankings/?metric=bpg" },
  { name: "Roster continuity", value: "Prior minutes represented", use: "Recruiting workload", topic: "recruiting", href: "/basketball/roster-lab/" },
];

describe("metric explorer filtering", () => {
  it("filters by topic", () => {
    expect(filterLearningMetrics(metrics, "", "player").map((metric) => metric.name)).toEqual(["True shooting", "Steals per game", "Blocks per game"]);
  });

  it("finds defensive event lessons and preserves their ranking handoffs", () => {
    expect(filterLearningMetrics(metrics, "steals", "player")).toEqual([
      expect.objectContaining({ name: "Steals per game", href: "/basketball/ncaa-rankings/?metric=spg" }),
    ]);
    expect(filterLearningMetrics(metrics, "rim protection", "player")).toEqual([
      expect.objectContaining({ name: "Blocks per game", href: "/basketball/ncaa-rankings/?metric=bpg" }),
    ]);
  });

  it("searches the definition and its coaching use", () => {
    expect(filterLearningMetrics(metrics, "scoring efficiency", "all").map((metric) => metric.name)).toEqual(["True shooting"]);
  });

  it("combines topic and search filters", () => {
    expect(filterLearningMetrics(metrics, "quality", "recruiting")).toEqual([]);
    expect(filterLearningMetrics(metrics, "workload", "recruiting").map((metric) => metric.name)).toEqual(["Roster continuity"]);
  });
});
