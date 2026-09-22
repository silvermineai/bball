import { describe, expect, it } from "vitest";
import { assessRecruitingCoverage } from "./recruiting-coverage";

describe("recruiting coverage assessment", () => {
  it("keeps a partial release visibly partial and gives the program denominator", () => {
    expect(assessRecruitingCoverage({
      coverage: {
        programs: 14,
        players: 96,
        events: 98,
        sources: 44,
        historical_links: 45,
        complete_national_coverage: false,
      },
      peopleCount: 96,
      eventCount: 98,
      sourceCount: 44,
      directoryProgramCount: 362,
      reviewQueue: {
        observed_programs: 354,
        reviewed_programs: 13,
        unreviewed_programs: 341,
        source_reviewed_programs: 14,
        reviewed_not_observed_programs: 1,
        rows: 354,
      },
    })).toEqual({
      status: "partial",
      observedPrograms: 14,
      directoryPrograms: 362,
      unrepresentedPrograms: 348,
      observedProgramShare: 14 / 362,
      countsConsistent: true,
      reviewQueue: {
        observedPrograms: 354,
        reviewedPrograms: 13,
        unreviewedPrograms: 341,
        sourceReviewedPrograms: 14,
        reviewedNotObservedPrograms: 1,
        rows: 354,
        countsConsistent: true,
      },
    });
  });

  it("does not infer completeness or a denominator when the release omits them", () => {
    expect(assessRecruitingCoverage({
      coverage: { programs: 2, players: 3, events: 4, sources: 1, historical_links: 0 },
      peopleCount: 3,
      eventCount: 4,
      sourceCount: 1,
    })).toMatchObject({ status: "unknown", directoryPrograms: null, unrepresentedPrograms: null, observedProgramShare: null, countsConsistent: true, reviewQueue: null });
  });

  it("flags a stale count instead of silently presenting it as reconciled", () => {
    expect(assessRecruitingCoverage({
      coverage: { programs: 1, players: 2, events: 2, sources: 1, historical_links: 0, complete_national_coverage: false },
      peopleCount: 3,
      eventCount: 2,
      sourceCount: 1,
    }).countsConsistent).toBe(false);
  });

  it("flags a queue denominator mismatch instead of presenting a national review count as reconciled", () => {
    const assessment = assessRecruitingCoverage({
      coverage: { programs: 14, players: 96, events: 98, sources: 44, historical_links: 45, complete_national_coverage: false },
      peopleCount: 96,
      eventCount: 98,
      sourceCount: 44,
      reviewQueue: {
        observed_programs: 354,
        reviewed_programs: 13,
        unreviewed_programs: 340,
        source_reviewed_programs: 14,
        reviewed_not_observed_programs: 1,
        rows: 353,
      },
    });
    expect(assessment.reviewQueue?.countsConsistent).toBe(false);
  });
});
