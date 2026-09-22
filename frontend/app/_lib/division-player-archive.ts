import { divisionRankingMetrics } from "./division-player-rankings";
import {
  sortDivisionPlayers,
  type DivisionPlayerWithEvidence,
} from "./division-player-detail";

/** Every retained NCAA field can drive a transparent lower-division sort. */
export const divisionPlayerArchiveMetricOptions = divisionRankingMetrics.map(([key, label]) => ({ key, label }));

export const DIVISION_PLAYER_ARCHIVE_PAGE_SIZE = 50;

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
