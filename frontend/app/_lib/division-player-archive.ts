import { divisionRankingMetrics } from "./division-player-rankings";
import {
  retainedPlayerValue,
  sortDivisionPlayers,
  type DivisionPlayerWithEvidence,
} from "./division-player-detail";

/** Every retained NCAA field can drive a transparent lower-division sort. */
export const divisionPlayerArchiveMetricOptions = divisionRankingMetrics.map(([key, label]) => ({ key, label }));

export const DIVISION_PLAYER_ARCHIVE_PAGE_SIZE = 50;

const validPlayerId = (value: unknown) =>
  (typeof value === "string" && value.trim().length > 0)
  || (typeof value === "number" && Number.isFinite(value));

const validDivision = (value: unknown): value is 1 | 2 | 3 | "1" | "2" | "3" =>
  value === 1 || value === 2 || value === 3 || value === "1" || value === "2" || value === "3";

/** Validate the retained player directory before any division filter or rank runs. */
export function parseDivisionPlayers(value: unknown): DivisionPlayerWithEvidence[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { players?: unknown }).players)) {
    throw new Error("Player archive has no player rows.");
  }
  const seen = new Set<string>();
  return ((value as { players: unknown[] }).players).map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Player archive contains a malformed row.");
    const row = entry as Record<string, unknown>;
    if (!validPlayerId(row.player_id) || !validDivision(row.division) || typeof row.name !== "string" || !row.name.trim()) {
      throw new Error("Player archive contains a malformed row.");
    }
    const playerId = String(row.player_id);
    if (seen.has(playerId)) throw new Error("Player archive contains duplicate IDs.");
    seen.add(playerId);
    return entry as DivisionPlayerWithEvidence;
  });
}

export type DivisionPlayerArchiveRankedRow = DivisionPlayerWithEvidence & {
  /** Competition rank within the filtered, exact-division cohort. */
  archive_rank: number | null;
};

export function filterDivisionPlayerArchive(
  players: readonly DivisionPlayerWithEvidence[],
  division: "2" | "3",
  query: string,
  metric: string,
): DivisionPlayerWithEvidence[] {
  const needle = query.trim().toLowerCase();
  const filtered = players
    .filter((player) => String(player.division) === division)
    .filter((player) => !needle || `${player.name} ${player.team_name || ""} ${player.player_id}`.toLowerCase().includes(needle));
  return sortDivisionPlayers(filtered, metric) as DivisionPlayerWithEvidence[];
}

/**
 * Attach a transparent Silvermine rank to the archive's sorted rows. The
 * rank is calculated before pagination, uses competition ranking (1, 1, 3),
 * and leaves source-missing values unranked instead of treating them as zero.
 * This is a view rank for the selected retained field; publisher ranks remain
 * available in source_stats and in the dedicated ranking desk.
 */
export function rankDivisionPlayerArchiveRows(
  players: readonly DivisionPlayerWithEvidence[],
  metric: string,
): DivisionPlayerArchiveRankedRow[] {
  const sorted = sortDivisionPlayers(players, metric);
  let previousValue: number | null = null;
  let competitionRank = 0;
  return sorted.map((player, index) => {
    const currentValue = retainedPlayerValue(player, metric);
    if (currentValue == null) {
      return { ...player, archive_rank: null };
    }
    if (previousValue === null || currentValue !== previousValue) {
      competitionRank = index + 1;
      previousValue = currentValue;
    }
    return { ...player, archive_rank: competitionRank };
  });
}

export function paginateDivisionPlayerArchive(
  players: readonly DivisionPlayerWithEvidence[],
  page: number,
  pageSize = DIVISION_PLAYER_ARCHIVE_PAGE_SIZE,
): { rows: DivisionPlayerWithEvidence[]; page: number; pages: number; total: number } {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : DIVISION_PLAYER_ARCHIVE_PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(players.length / safePageSize));
  const safePage = Math.min(Math.max(Number.isFinite(page) ? Math.floor(page) : 0, 0), pages - 1);
  return {
    rows: players.slice(safePage * safePageSize, (safePage + 1) * safePageSize),
    page: safePage,
    pages,
    total: players.length,
  };
}

const preferredExportKeys = [
  "player_id", "name", "team_name", "team_ncaa_id", "division", "conference", "class_year", "position",
];

function exportCell(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Export every retained scalar field plus the exact source evidence object. */
export function divisionPlayerArchiveExport(
  players: readonly DivisionPlayerWithEvidence[],
): { headers: string[]; rows: Array<Array<string | number | null>> } {
  const keys = Array.from(new Set(players.flatMap((player) => Object.keys(player))))
    .filter((key) => key !== "source_stats")
    .sort((left, right) => {
      const leftIndex = preferredExportKeys.indexOf(left);
      const rightIndex = preferredExportKeys.indexOf(right);
      if (leftIndex >= 0 || rightIndex >= 0) return (leftIndex < 0 ? preferredExportKeys.length : leftIndex) - (rightIndex < 0 ? preferredExportKeys.length : rightIndex);
      return left.localeCompare(right);
    });
  const headers = [...keys, "source_stats_json"];
  const rows = players.map((player) => [
    ...keys.map((key) => exportCell(player[key])),
    exportCell(player.source_stats || null),
  ]);
  return { headers, rows };
}
