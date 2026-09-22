export type RankingCohortRow = { rank?: unknown };

export type RankingCohortIntegrity =
  | { ok: true; total: number }
  | { ok: false; reason: string };

/**
 * Keep rank and percentile displays tied to a real source cohort. A missing,
 * fractional, or out-of-range rank is unavailable evidence, not a rank to
 * coerce into the table.
 */
export function validateRankingCohort(
  total: unknown,
  rows: readonly RankingCohortRow[],
): RankingCohortIntegrity {
  if (!Number.isInteger(total) || (total as number) < 0) {
    return { ok: false, reason: "The player ranking release returned an invalid cohort size." };
  }

  const cohortTotal = total as number;
  if (rows.length > cohortTotal) {
    return { ok: false, reason: "The player ranking release returned more rows than its cohort size." };
  }

  for (const row of rows) {
    if (!Number.isInteger(row.rank) || (row.rank as number) < 1 || (row.rank as number) > cohortTotal) {
      return { ok: false, reason: "The player ranking release returned a rank outside its cohort." };
    }
  }

  return { ok: true, total: cohortTotal };
}
