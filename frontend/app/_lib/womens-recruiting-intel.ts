import { womensPlayerStatValue, type WomensPlayerStats } from "./womens-player-detail";

export type WomensObservedPlayer = {
  player_id: string;
  name: string;
  team: string;
  position?: string | null;
  stats: WomensPlayerStats;
};

export type WomensObservedMetric = "avgPoints" | "avgRebounds" | "avgAssists" | "avgMinutes";

export type WomensRecruitingProspect = {
  athlete_id: string;
  name: string;
  position?: string | null;
  grade?: number | null;
  rank?: number | null;
  status?: string | null;
  committed_team_id?: string | null;
  committed_team_name?: string | null;
  high_school?: string | null;
  hometown?: string | null;
};

export type WomensRecruitingStatusSummary = {
  status: string;
  prospects: number;
  graded: number;
  averageGrade: number | null;
  exactIds: number;
  destinationIds: number;
};

/** Filter and sort the women-specific prospect cohort without inventing ranks. */
export function rankWomensRecruitingProspects(
  records: WomensRecruitingProspect[],
  query = "",
  limit = 20,
): WomensRecruitingProspect[] {
  const needle = query.trim().toLowerCase();
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 0;
  return records
    .filter((row) => !needle || `${row.name} ${row.position || ""} ${row.high_school || ""} ${row.hometown || ""} ${row.athlete_id}`.toLowerCase().includes(needle))
    .sort((left, right) => (right.grade ?? -Infinity) - (left.grade ?? -Infinity) || left.name.localeCompare(right.name) || left.athlete_id.localeCompare(right.athlete_id))
    .slice(0, safeLimit);
}

/**
 * Summarize the source status field without promoting it to a destination or
 * commitment join. Duplicate or blank source IDs invalidate the summary so a
 * status trend cannot double-count a prospect.
 */
export function summarizeWomensRecruitingProspects(
  records: WomensRecruitingProspect[],
): WomensRecruitingStatusSummary[] {
  if (!records.every((row) => typeof row.name === "string" && row.name.trim())) return [];
  const ids = records.map((row) => typeof row.athlete_id === "string" ? row.athlete_id.trim() : "");
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return [];
  const byStatus = new Map<string, { prospects: number; graded: number; gradeTotal: number; exactIds: number; destinationIds: number }>();
  records.forEach((row) => {
    const status = row.status?.trim() || "Status unavailable";
    const grade = typeof row.grade === "number" && Number.isFinite(row.grade) ? row.grade : null;
    const current = byStatus.get(status) || { prospects: 0, graded: 0, gradeTotal: 0, exactIds: 0, destinationIds: 0 };
    current.prospects += 1;
    current.exactIds += 1;
    if (grade != null) {
      current.graded += 1;
      current.gradeTotal += grade;
    }
    if (row.committed_team_id?.trim()) current.destinationIds += 1;
    byStatus.set(status, current);
  });
  return Array.from(byStatus.entries())
    .map(([status, value]) => ({
      status,
      prospects: value.prospects,
      graded: value.graded,
      averageGrade: value.graded > 0 ? value.gradeTotal / value.graded : null,
      exactIds: value.exactIds,
      destinationIds: value.destinationIds,
    }))
    .sort((left, right) => right.prospects - left.prospects || left.status.localeCompare(right.status));
}

/**
 * Rank only retained source rows for the women’s recruiting context panel.
 * This is a production shortlist, not a recruiting ranking: missing metric
 * values remain unavailable and never become zeroes or inferred grades.
 */
export function rankWomensObservedPlayers(
  players: WomensObservedPlayer[],
  metric: WomensObservedMetric,
  limit = 12,
): Array<WomensObservedPlayer & { metricValue: number | null }> {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 0;
  return players
    .map((player) => ({ ...player, metricValue: womensPlayerStatValue(player.stats, metric) }))
    .sort((left, right) => {
      const leftValue = left.metricValue ?? -Infinity;
      const rightValue = right.metricValue ?? -Infinity;
      return rightValue - leftValue || left.name.localeCompare(right.name) || left.player_id.localeCompare(right.player_id);
    })
    .slice(0, safeLimit);
}
