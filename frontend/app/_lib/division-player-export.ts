import type { CsvCell } from "./csv";
import {
  divisionMetricLabel,
  divisionMetricValue,
  divisionRankingMetrics,
  divisionSourceRank,
  type DivisionRankedPlayer,
  type DivisionRankingMetric,
} from "./division-player-rankings";

export const divisionPlayerCsvHeaders = [
  "Rank", "Player ID", "Division", "Player", "Team", "Conference", "Class", "Position", "GP",
  "Selected metric", "Selected value", "Publisher rank",
  ...divisionRankingMetrics.map(([key]) => `${divisionMetricLabel(key)} [${key}]`),
  "Publisher evidence",
];

/** Export only recorded fields; null cells remain blank in the CSV. */
export function divisionPlayerCsvRows(rows: DivisionRankedPlayer[], metric: DivisionRankingMetric): CsvCell[][] {
  return rows.map((player) => [
    player.rank, String(player.player_id), String(player.division), player.name, player.team_name,
    player.conference, player.class_year, player.position, player.games, metric,
    divisionMetricValue(player, metric), divisionSourceRank(player, metric),
    ...divisionRankingMetrics.map(([key]) => divisionMetricValue(player, key)),
    player.source_stats ? JSON.stringify(player.source_stats) : null,
  ]);
}

export type DivisionExportPage = { total?: unknown; limit?: unknown; rows?: unknown };

/** Keep a multi-page export tied to one exact API cohort and page size. */
export function validateDivisionPlayerExportPage(
  payload: DivisionExportPage, expectedTotal: number, expectedPageSize: number, page: number, totalPages: number,
  expectedDivision?: "2" | "3",
): unknown[] {
  const total = Number(payload.total);
  const limit = Number(payload.limit || expectedPageSize);
  if (!Number.isInteger(total) || total !== expectedTotal || !Number.isInteger(limit) || limit !== expectedPageSize || !Array.isArray(payload.rows) || payload.rows.length > expectedPageSize) {
    throw new Error("The lower-division player archive changed during export.");
  }
  if (page < totalPages - 1 && payload.rows.length === 0) {
    throw new Error("The lower-division player archive returned an incomplete page.");
  }
  if (expectedDivision && payload.rows.some((row) => {
    if (!row || typeof row !== "object") return true;
    const candidate = row as Record<string, unknown>;
    const playerId = candidate.player_id;
    return String(candidate.division) !== expectedDivision
      || (typeof playerId !== "string" && typeof playerId !== "number")
      || String(playerId).trim().length === 0;
  })) {
    throw new Error("The lower-division player archive returned a row outside the requested division or without a player identity.");
  }
  return payload.rows;
}
