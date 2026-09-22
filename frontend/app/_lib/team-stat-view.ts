/**
 * Return the ordinal for a row in the API's already sorted, paginated team
 * stat cohort. The endpoint order is the source of truth (descending or
 * ascending is selected by the reader), so this helper never re-sorts or
 * compares display strings locally.
 */
export function teamStatCohortRank(
  page: number,
  pageSize: number,
  total: number,
  rowIndex: number,
  authoritativeRank: number | null | undefined = null,
): number | null {
  // The API can provide a tie-aware competition rank. Keep the positional
  // calculation as a compatibility fallback for older cached responses.
  if (authoritativeRank != null && Number.isInteger(authoritativeRank) && authoritativeRank >= 1 && authoritativeRank <= total) {
    return authoritativeRank;
  }
  if (!Number.isInteger(page) || page < 0
    || !Number.isInteger(pageSize) || pageSize < 1
    || !Number.isInteger(total) || total < 0
    || !Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= pageSize
    || page * pageSize + rowIndex >= total) return null;
  return page * pageSize + rowIndex + 1;
}

/** Percentile among the matching rows, where rank 1 is the best row. */
export function teamStatCohortPercentile(rank: number | null, total: number): number | null {
  if (rank == null || !Number.isInteger(rank) || rank < 1 || !Number.isInteger(total) || total < rank) return null;
  return total <= 1 ? 100 : ((total - rank) / (total - 1)) * 100;
}
