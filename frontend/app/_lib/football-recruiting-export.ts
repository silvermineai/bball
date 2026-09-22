import { toCsv, type CsvCell } from "./csv";

export type FootballRecruitingView = "rosters" | "recruits" | "talent" | "returning";

type FootballRecruitingRow = Record<string, unknown> & {
  id?: string | null;
  team_id?: string | null;
  record_key?: string | null;
};

const columns: Record<FootballRecruitingView, string[]> = {
  rosters: ["season", "athlete_id", "name", "team_id", "team", "division", "position", "experience", "status", "active", "height", "weight", "record_key"],
  recruits: ["season", "recruit_id", "name", "team_id", "team", "division", "position", "stars", "grade", "record_key"],
  talent: ["season", "team_id", "team", "division", "talent_composite", "talent_rank", "blue_chip_ratio", "n_recruits", "record_key"],
  returning: ["season", "team_id", "team", "division", "off_returning", "def_returning", "overall_returning", "n_returning", "is_estimated", "record_key"],
};

const field = (row: FootballRecruitingRow, key: string, season: number): CsvCell => {
  if (key === "season") return season;
  if (key === "athlete_id" || key === "recruit_id") return row.id ?? null;
  const value = row[key];
  return value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value as CsvCell
    : JSON.stringify(value);
};

/**
 * Export exactly the bounded rows currently returned by the football
 * recruiting API. IDs and record keys make each row traceable to its source
 * edition; absent source fields remain blank instead of becoming zeroes.
 */
export function footballRecruitingCsv(
  view: FootballRecruitingView,
  rows: FootballRecruitingRow[],
  season: number,
): string {
  const headers = columns[view];
  return toCsv(headers, rows.map((row) => headers.map((key) => field(row, key, season))));
}

export function footballRecruitingExportHeaders(view: FootballRecruitingView): string[] {
  return [...columns[view]];
}
