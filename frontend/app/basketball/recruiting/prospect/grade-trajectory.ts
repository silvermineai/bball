export type ProspectGradeHistoryEntry = {
  grade?: number | null;
};

export type ProspectGradeTrajectory = {
  firstGrade: number;
  latestGrade: number;
  bestGrade: number;
  lowestGrade: number;
  averageGrade: number;
  gradeSpan: number;
  gradedCaptures: number;
  totalCaptures: number;
  gradeCoverage: number;
  netChange: number;
  direction: "higher" | "lower" | "unchanged";
};

const validGrade = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Summarize only positive finite grades retained for one exact athlete ID.
 * Missing grades stay out of the arithmetic but remain in the coverage
 * denominator; this is source-scale movement, not a Silvermine evaluation.
 */
export function prospectGradeTrajectory(
  history: ReadonlyArray<ProspectGradeHistoryEntry>,
): ProspectGradeTrajectory | null {
  if (!Array.isArray(history) || history.length < 2) return null;
  const grades = history
    .map((entry) => entry?.grade)
    .filter(validGrade);
  if (grades.length < 2) return null;
  const firstGrade = grades[0];
  const latestGrade = grades[grades.length - 1];
  const bestGrade = Math.max(...grades);
  const lowestGrade = Math.min(...grades);
  const averageGrade = grades.reduce((sum, grade) => sum + grade, 0) / grades.length;
  const netChange = latestGrade - firstGrade;
  return {
    firstGrade,
    latestGrade,
    bestGrade,
    lowestGrade,
    averageGrade,
    gradeSpan: bestGrade - lowestGrade,
    gradedCaptures: grades.length,
    totalCaptures: history.length,
    gradeCoverage: grades.length / history.length,
    netChange,
    direction: netChange > 0 ? "higher" : netChange < 0 ? "lower" : "unchanged",
  };
}
