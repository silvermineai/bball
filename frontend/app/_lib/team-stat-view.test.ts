import { describe, expect, it } from "vitest";
import { teamStatCohortPercentile, teamStatCohortRank } from "./team-stat-view";

describe("team stat cohort position", () => {
  it("uses the API page offset and preserves the selected sort order", () => {
    expect(teamStatCohortRank(0, 40, 362, 0)).toBe(1);
    expect(teamStatCohortRank(2, 40, 362, 3)).toBe(84);
    expect(teamStatCohortRank(0, 40, 362, 39)).toBe(40);
  });

  it("withholds positions when pagination metadata cannot support them", () => {
    expect(teamStatCohortRank(-1, 40, 362, 0)).toBeNull();
    expect(teamStatCohortRank(0, 0, 362, 0)).toBeNull();
    expect(teamStatCohortRank(9, 40, 362, 3)).toBeNull();
    expect(teamStatCohortRank(0, 40, 2, 2)).toBeNull();
  });

  it("calculates a best-first percentile without treating an unavailable rank as zero", () => {
    expect(teamStatCohortPercentile(1, 5)).toBe(100);
    expect(teamStatCohortPercentile(3, 5)).toBe(50);
    expect(teamStatCohortPercentile(5, 5)).toBe(0);
    expect(teamStatCohortPercentile(null, 5)).toBeNull();
  });
});
