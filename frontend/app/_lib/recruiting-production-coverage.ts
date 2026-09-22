import { exactRecruitingProduction, type RecruitingProductionIndex } from "./recruiting-production-index";

export type RecruitingProductionCoverage = {
  totalRows: number;
  linkedRows: number;
  unavailableRows: number;
  linkedShare: number | null;
};

/**
 * Reconcile exact-ID production links against the prospect rows currently
 * visible on the board. This is page-scoped because the rankings API returns a
 * bounded page; it must never be presented as whole-class coverage. Duplicate
 * or malformed prospect IDs withhold the summary rather than creating an
 * ambiguous denominator.
 */
export function recruitingProductionCoverage<T extends { athlete_id: string }>(
  rows: T[],
  index: RecruitingProductionIndex | null | undefined,
): RecruitingProductionCoverage | null {
  if (!index || !Array.isArray(rows)) return null;
  const ids = rows.map((row) => row.athlete_id);
  if (ids.some((id) => !/^\d{1,15}$/.test(id)) || new Set(ids).size !== ids.length) return null;
  const linkedRows = ids.filter((id) => exactRecruitingProduction(index, id) != null).length;
  return {
    totalRows: rows.length,
    linkedRows,
    unavailableRows: rows.length - linkedRows,
    linkedShare: rows.length > 0 ? linkedRows / rows.length : null,
  };
}
