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
  };
}
