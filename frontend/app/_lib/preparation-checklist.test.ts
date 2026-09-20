import { describe, expect, it } from "vitest";
import { buildPreparationChecklist } from "./preparation-checklist";

describe("buildPreparationChecklist", () => {
  it("adds evidence-specific assignments and uncertainty work", () => {
    const tasks = buildPreparationChecklist({
      pressureLabels: ["Effective FG%"],
      shotPrepCount: 2,
      factorPersonnelCount: 1,
      forecastType: "primary",
      marginLow: -1.5,
      marginHigh: 4.5,
    });
    expect(tasks).toEqual([
      "Review the effective fg% pressure point on film and name the coverage response.",
      "Verify 2 exact-ID shot-profile assignments against current availability and role.",
      "Assign a defender and fallback coverage for 1 personnel-to-factor prompt.",
      "Confirm current availability and the expected rotation with dated school evidence.",
      "Build a one-possession plan for either result because the model range crosses zero.",
      "Check the forecast record and capture time before using a market comparison.",
    ]);
  });

  it("keeps sparse and cold-start briefs actionable without claiming missing evidence", () => {
    const tasks = buildPreparationChecklist({
      pressureLabels: [],
      shotPrepCount: 0,
      factorPersonnelCount: 0,
      forecastType: "cold_start",
      marginLow: 5,
      marginHigh: 12,
    });
    expect(tasks).toContain("Stress-test the cold-start estimate with a conservative rotation and pace scenario.");
    expect(tasks).not.toContain(expect.stringContaining("exact-ID shot-profile"));
  });
});
