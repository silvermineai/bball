import { describe, expect, it } from "vitest";
import { prospectGradeTrajectory } from "./grade-trajectory";

describe("prospect recorded grade trajectory", () => {
  it("summarizes exact-ID grade movement and keeps missing captures in coverage", () => {
    expect(prospectGradeTrajectory([
      { grade: 88 },
      { grade: null },
      { grade: 91.5 },
      { grade: 90 },
    ])).toEqual({
      firstGrade: 88,
      latestGrade: 90,
      bestGrade: 91.5,
      lowestGrade: 88,
      averageGrade: (88 + 91.5 + 90) / 3,
      gradeSpan: 3.5,
      gradedCaptures: 3,
      totalCaptures: 4,
      gradeCoverage: 0.75,
      netChange: 2,
      direction: "higher",
    });
  });

  it("withholds a trajectory without two usable source grades", () => {
    expect(prospectGradeTrajectory([{ grade: 88 }, { grade: null }])).toBeNull();
    expect(prospectGradeTrajectory([{ grade: 0 }, { grade: Number.NaN }])).toBeNull();
    expect(prospectGradeTrajectory([{ grade: 88 }])).toBeNull();
  });

  it("does not turn an unchanged source grade into a directional claim", () => {
    expect(prospectGradeTrajectory([{ grade: 90 }, { grade: 90 }])).toMatchObject({
      netChange: 0,
      direction: "unchanged",
      gradeSpan: 0,
    });
  });
});
