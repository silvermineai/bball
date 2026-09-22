import { describe, expect, it } from "vitest";
import { prospectLearningChecks } from "./learning-questions";

describe("prospect learning queue", () => {
  it("turns retained rank, destination and school evidence into review checks", () => {
    const checks = prospectLearningChecks({
      rank: 12,
      previousRank: 18,
      previousCapturedAt: "2026-08-01T00:00:00Z",
      committedTeamId: "10",
      committedTeamName: "Alpha",
      recordedSchoolCount: 3,
      resolvedSchoolCount: 2,
      hasPeerContext: true,
    });
    expect(checks.every((check) => check.status === "recorded")).toBe(true);
    expect(checks[0].detail).toBe("Up 6 places from the prior capture");
    expect(checks[2].detail).toContain("exact team ID");
    expect(checks[3].detail).toBe("3 retained school IDs · 2 directory matches");
  });

  it("keeps absent evidence unavailable instead of inferring a recruiting story", () => {
    const checks = prospectLearningChecks({
      rank: 40,
      previousRank: null,
      previousCapturedAt: null,
      committedTeamId: null,
      committedTeamName: null,
      recordedSchoolCount: 0,
      resolvedSchoolCount: 0,
      hasPeerContext: false,
    });
    expect(checks.map((check) => check.status)).toEqual([
      "unavailable", "unavailable", "unavailable", "unavailable", "unavailable",
    ]);
    expect(checks[0].detail).toBe("No prior retained rank capture");
    expect(checks[2].detail).toBe("Requires a recorded destination team ID");
  });

  it("does not call destination fit recorded when the team ID is unresolved", () => {
    const checks = prospectLearningChecks({
      rank: 12,
      previousRank: null,
      committedTeamId: "missing-team",
      committedTeamName: "Recorded School",
      destinationProgramResolved: false,
      recordedSchoolCount: 1,
      resolvedSchoolCount: 0,
      hasPeerContext: false,
    });
    expect(checks[1].status).toBe("recorded");
    expect(checks[2]).toMatchObject({
      status: "unavailable",
      detail: "Destination ID has no exact program-directory match",
    });
  });
});
