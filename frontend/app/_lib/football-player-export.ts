import type { CsvCell } from "./csv";

/** One page of exact-athlete rows returned by the football player dossier. */
export type FootballPlayerExportRow = {
  dataset: string;
  season: number;
  game_id: string | null;
  record_key: string | null;
  athlete_id: string;
  team_id: string | null;
  category: string;
  stats: Record<string, unknown>;
  kickoff: string | null;
  home_name: string | null;
  away_name: string | null;
};

const contextHeaders = [
  "Dataset",
  "Season",
  "Game ID",
  "Record key",
  "Athlete ID",
  "Team ID",
  "Kickoff",
  "Away",
  "Home",
  "Category",
] as const;

/**
 * Return stable, source-preserving columns for a page of player rows.
 *
 * The API intentionally retains provider fields without a fixed schema. A
 * union of the keys on this page keeps newly published fields exportable and
 * leaves absent fields blank instead of treating them as zero. Prefixing the
 * columns makes it clear that their names come from the source payload.
 */
export function footballPlayerExportHeaders(rows: readonly FootballPlayerExportRow[]) {
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row.stats)))].sort((a, b) => a.localeCompare(b));
  return [...contextHeaders, ...fields.map((field) => `source.${field}`)];
}

function cell(value: unknown): CsvCell {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function footballPlayerExportRows(
  rows: readonly FootballPlayerExportRow[],
  headers = footballPlayerExportHeaders(rows),
): CsvCell[][] {
  const fields = headers.slice(contextHeaders.length).map((header) => header.slice("source.".length));
  return rows.map((row) => [
    row.dataset,
    row.season,
    row.game_id,
    row.record_key,
    row.athlete_id,
    row.team_id,
    row.kickoff,
    row.away_name,
    row.home_name,
    row.category,
    ...fields.map((field) => cell(row.stats[field])),
  ]);
}
