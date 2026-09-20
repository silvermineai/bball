import type { ProspectProgram } from "./prospect-schools";

export type RecordedSchoolProgramRow = {
  edition: string;
  school_id: string;
  prospect_total: number;
  uncommitted_total: number;
  committed_here_total: number;
  ranked_total: number;
  top100_total: number;
  best_rank: number | null;
  average_rank: number | null;
  position_breakdown: Array<{ position: string; total: number }>;
};

export type RecordedSchoolProgram = RecordedSchoolProgramRow & {
  name: string;
  resolved: boolean;
};

const whole = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const rank = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Validate aggregate rows against the response edition before resolving names.
 * Any malformed or mixed-edition row is withheld instead of being repaired.
 */
export function recordedSchoolPrograms(
  rows: unknown,
  expectedEdition: string | null | undefined,
  programs: ProspectProgram[],
): RecordedSchoolProgram[] {
  const edition = typeof expectedEdition === "string" ? expectedEdition.trim() : "";
  if (!edition || !Array.isArray(rows)) return [];
  const byId = new Map(programs.map((program) => [String(program.id), program]));
  const seen = new Set<string>();
  const valid: RecordedSchoolProgram[] = [];

  for (const value of rows) {
    if (!value || typeof value !== "object") return [];
    const row = value as Partial<RecordedSchoolProgramRow>;
    const schoolId = typeof row.school_id === "string" ? row.school_id.trim() : "";
    if (!/^\d{1,15}$/.test(schoolId) || seen.has(schoolId) || row.edition !== edition) return [];
    const counts = [row.prospect_total, row.uncommitted_total, row.committed_here_total, row.ranked_total, row.top100_total];
    if (!counts.every(whole) || !row.prospect_total || row.uncommitted_total! > row.prospect_total
      || row.committed_here_total! > row.prospect_total
      || row.uncommitted_total! + row.committed_here_total! > row.prospect_total
      || row.ranked_total! > row.prospect_total || row.top100_total! > row.ranked_total!) return [];
    if (row.ranked_total === 0 ? row.best_rank != null || row.average_rank != null : !rank(row.best_rank) || !rank(row.average_rank)) return [];
    if (!Array.isArray(row.position_breakdown) || row.position_breakdown.length === 0) return [];
    const positions = row.position_breakdown.map((item) => ({
      position: typeof item?.position === "string" ? item.position.trim() : "",
      total: item?.total,
    }));
    if (positions.some((item) => !item.position || !whole(item.total))
      || new Set(positions.map((item) => item.position)).size !== positions.length
      || positions.reduce((sum, item) => sum + Number(item.total), 0) !== row.prospect_total) return [];

    const program = byId.get(schoolId);
    seen.add(schoolId);
    valid.push({
      edition,
      school_id: schoolId,
      prospect_total: row.prospect_total,
      uncommitted_total: row.uncommitted_total!,
      committed_here_total: row.committed_here_total!,
      ranked_total: row.ranked_total!,
      top100_total: row.top100_total!,
      best_rank: row.best_rank ?? null,
      average_rank: row.average_rank ?? null,
      position_breakdown: positions as Array<{ position: string; total: number }>,
      name: program?.shortName || program?.name || `Program ${schoolId}`,
      resolved: Boolean(program),
    });
  }
  return valid;
}
