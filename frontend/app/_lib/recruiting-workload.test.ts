import { describe, expect, it } from "vitest";
import { recruitingWorkload } from "./recruiting-workload";

describe("recruiting workload worksheet", () => {
  it("keeps returning and incoming minutes separate while calculating coverage", () => {
    expect(recruitingWorkload({ priorMinutes: 1000, returningMinutes: 600, incomingMinutes: 200 })).toEqual({
      priorMinutes: 1000,
      returningMinutes: 600,
      incomingMinutes: 200,
      representedMinutes: 800,
      unrepresentedMinutes: 200,
      returningShare: 0.6,
      incomingShare: 0.2,
      representedShare: 0.8,
    });
  });

  it("guards negative values and a zero denominator", () => {
    expect(recruitingWorkload({ priorMinutes: 0, returningMinutes: -10, incomingMinutes: 30 })).toMatchObject({
      priorMinutes: 0,
      returningMinutes: 0,
      incomingMinutes: 30,
      representedMinutes: 30,
      unrepresentedMinutes: 0,
      returningShare: null,
      incomingShare: null,
      representedShare: null,
    });
  });
});
