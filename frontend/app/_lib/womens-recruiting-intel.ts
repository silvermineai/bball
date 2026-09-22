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
  high_school?: string | null;
  hometown?: string | null;
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
