export type RecruitingCoverageCounts = {
  programs: number;
  players: number;
  events: number;
  sources: number;
  historical_links: number;
  complete_national_coverage?: boolean;
};

export type RecruitingCoverageAssessment = {
  status: "complete" | "partial" | "unknown";
  observedPrograms: number;
  directoryPrograms: number | null;
  unrepresentedPrograms: number | null;
  observedProgramShare: number | null;
  countsConsistent: boolean;
  reviewQueue: RecruitingReviewQueueAssessment | null;
};

export type RecruitingReviewQueueAssessment = {
  observedPrograms: number;
  reviewedPrograms: number;
  unreviewedPrograms: number;
  sourceReviewedPrograms: number;
  reviewedNotObservedPrograms: number;
  rows: number;
  countsConsistent: boolean;
};

const nonnegativeInteger = (value: number | null | undefined) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
};

/**
 * Describe the retained recruiting release without upgrading a partial
 * announcement file into a national roster claim. Directory counts are only
 * used as a visible comparison denominator; they do not imply that every
 * directory program should have a recruiting record.
 */
export function assessRecruitingCoverage(input: {
  coverage: RecruitingCoverageCounts;
  peopleCount: number;
  eventCount: number;
  sourceCount: number;
  directoryProgramCount?: number;
  reviewQueue?: {
    observed_programs: number;
    reviewed_programs: number;
    unreviewed_programs: number;
    source_reviewed_programs: number;
    reviewed_not_observed_programs: number;
    rows: number;
  } | null;
}): RecruitingCoverageAssessment {
  const directoryPrograms = input.directoryProgramCount == null
    ? null
    : nonnegativeInteger(input.directoryProgramCount);
  const observedPrograms = nonnegativeInteger(input.coverage.programs);
  const status = input.coverage.complete_national_coverage === true
    ? "complete"
    : input.coverage.complete_national_coverage === false
      ? "partial"
      : "unknown";
  const countsConsistent = [
    input.coverage.players === nonnegativeInteger(input.peopleCount),
    input.coverage.events === nonnegativeInteger(input.eventCount),
    input.coverage.sources === nonnegativeInteger(input.sourceCount),
  ].every(Boolean);
  const queue = input.reviewQueue;
  const reviewQueue = queue == null ? null : {
    observedPrograms: nonnegativeInteger(queue.observed_programs),
    reviewedPrograms: nonnegativeInteger(queue.reviewed_programs),
    unreviewedPrograms: nonnegativeInteger(queue.unreviewed_programs),
    sourceReviewedPrograms: nonnegativeInteger(queue.source_reviewed_programs),
    reviewedNotObservedPrograms: nonnegativeInteger(queue.reviewed_not_observed_programs),
    rows: nonnegativeInteger(queue.rows),
    countsConsistent: [
      queue.reviewed_programs + queue.unreviewed_programs === queue.observed_programs,
      queue.reviewed_programs + queue.reviewed_not_observed_programs === queue.source_reviewed_programs,
      queue.rows === queue.observed_programs,
    ].every(Boolean),
  };
  return {
    status,
    observedPrograms,
    directoryPrograms,
    unrepresentedPrograms: directoryPrograms == null
      ? null
      : Math.max(0, directoryPrograms - observedPrograms),
    observedProgramShare: directoryPrograms && directoryPrograms > 0
      ? Math.min(1, observedPrograms / directoryPrograms)
      : null,
    countsConsistent,
    reviewQueue,
  };
}
