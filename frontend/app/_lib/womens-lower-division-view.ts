export type LowerDivisionRow = Record<string, unknown> & {
  name?: unknown;
  team?: unknown;
  team_source_path?: unknown;
  rank?: unknown;
  g?: unknown;
  gm?: unknown;
  source_fields?: Record<string, unknown>;
};

export type WomensLowerDivisionTeamSummaryStat = {
  statistic: string;
  label: string;
  source_url: string;
  rows: number;
  best_source_rank: number | null;
};

export type WomensLowerDivisionTeamSummary = {
  team_source_path: string;
  team: string;
  name_variants: string[];
  appearances: number;
  statistics: WomensLowerDivisionTeamSummaryStat[];
  best_source_rank: number | null;
};

export type WomensLowerDivisionCoverage = {
  individual_statistics: number;
  team_statistics: number;
  individual_rows: number;
  team_rows: number;
  through_games: string | null;
};

export const LOWER_DIVISION_PAGE_SIZE = 25;

/**
 * Summarize one exact-division source edition without interpreting any row.
 * The source publishes a separate top-50 table for each statistic, so row
 * counts describe table coverage and must not be presented as unique players
 * or teams.
 */
export function summarizeWomensLowerDivisionCoverage(
  division: {
    individual: ReadonlyArray<{ rows: ReadonlyArray<unknown>; through_games?: string | null }>;
    team: ReadonlyArray<{ rows: ReadonlyArray<unknown>; through_games?: string | null }>;
    through_games?: string | null;
  },
): WomensLowerDivisionCoverage {
  const throughGames = division.through_games
    || division.individual.find((stat) => stat.through_games)?.through_games
    || division.team.find((stat) => stat.through_games)?.through_games
    || null;
  return {
    individual_statistics: division.individual.length,
    team_statistics: division.team.length,
    individual_rows: division.individual.reduce((count, stat) => count + stat.rows.length, 0),
    team_rows: division.team.reduce((count, stat) => count + stat.rows.length, 0),
    through_games: throughGames,
  };
}

const text = (value: unknown) => value == null ? "" : String(value);

/**
 * Return the value for a published column without guessing at its meaning.
 *
 * NCAA table headers are not stable object keys (for example, `FG%` is
 * published as `fg` by the capture normalizer).  The retained source_fields
 * map is therefore authoritative for rendering.  The normalized-key fallback
 * keeps this helper useful for older releases that predate source_fields.
 */
export const lowerDivisionCellValue = (row: LowerDivisionRow, header: string): unknown => {
  const sourceFields = row.source_fields;
  if (sourceFields && Object.prototype.hasOwnProperty.call(sourceFields, header)) return sourceFields[header];
  const key = header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  return row[header];
};

const number = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

/** Read the source's games column without filling missing values. */
export const lowerDivisionGames = (row: LowerDivisionRow): number | null => {
  const direct = number(row.g ?? row.gm);
  if (direct != null) return direct;
  const fields = row.source_fields || {};
  return number(fields.G ?? fields.GM);
};

const sourceRank = (row: LowerDivisionRow): number | null => {
  const direct = number(row.rank);
  return direct != null && direct > 0 ? direct : null;
};

const sourceTeamName = (row: LowerDivisionRow): string => {
  const direct = text(row.team).trim();
  if (direct) return direct;
  return text(row.source_fields?.Team).trim();
};

/**
 * Summarize the source's team leaderboards by the exact team URL slug that
 * the publisher attached to each row. This is a descriptive team index: it
 * does not join names, guess school identities, or turn leaderboard
 * appearances into a power rating.
 */
export function summarizeWomensLowerDivisionTeams(
  statistics: ReadonlyArray<{
    statistic: string;
    label: string;
    source_url: string;
    rows: readonly LowerDivisionRow[];
  }>,
  minimumGames = 0,
): WomensLowerDivisionTeamSummary[] {
  const minimum = Number.isFinite(minimumGames) && minimumGames > 0 ? minimumGames : 0;
  type Mutable = {
    team_source_path: string;
    names: Set<string>;
    appearances: number;
    best_source_rank: number | null;
    stats: Map<string, WomensLowerDivisionTeamSummaryStat>;
  };
  const byPath = new Map<string, Mutable>();
  for (const statistic of statistics) {
    for (const row of statistic.rows) {
      const teamSourcePath = text(row.team_source_path).trim();
      if (!teamSourcePath) continue;
      const games = lowerDivisionGames(row);
      if (minimum && (games == null || games < minimum)) continue;
      const entry = byPath.get(teamSourcePath) || {
        team_source_path: teamSourcePath,
        names: new Set<string>(),
        appearances: 0,
        best_source_rank: null,
        stats: new Map<string, WomensLowerDivisionTeamSummaryStat>(),
      };
      const teamName = sourceTeamName(row);
      if (teamName) entry.names.add(teamName);
      entry.appearances += 1;
      const rank = sourceRank(row);
      if (rank != null && (entry.best_source_rank == null || rank < entry.best_source_rank)) entry.best_source_rank = rank;
      const prior = entry.stats.get(statistic.statistic);
      if (!prior) {
        entry.stats.set(statistic.statistic, {
          statistic: statistic.statistic,
          label: statistic.label,
          source_url: statistic.source_url,
          rows: 1,
          best_source_rank: rank,
        });
      } else {
        prior.rows += 1;
        if (rank != null && (prior.best_source_rank == null || rank < prior.best_source_rank)) prior.best_source_rank = rank;
      }
      byPath.set(teamSourcePath, entry);
    }
  }
  return Array.from(byPath.values())
    .map((entry) => ({
      team_source_path: entry.team_source_path,
      team: Array.from(entry.names)[0] || "—",
      name_variants: Array.from(entry.names).sort((left, right) => left.localeCompare(right)),
      appearances: entry.appearances,
      statistics: Array.from(entry.stats.values()).sort((left, right) => left.label.localeCompare(right.label)),
      best_source_rank: entry.best_source_rank,
    }))
    .sort((left, right) => right.appearances - left.appearances
      || right.statistics.length - left.statistics.length
      || (left.best_source_rank ?? Number.POSITIVE_INFINITY) - (right.best_source_rank ?? Number.POSITIVE_INFINITY)
      || left.team.localeCompare(right.team)
      || left.team_source_path.localeCompare(right.team_source_path));
}

const searchText = (row: LowerDivisionRow) => [
  row.name,
  row.team,
  row.rank,
  row.source_fields && Object.values(row.source_fields),
].flat().map(text).join(" ").toLowerCase();

/** Filter source-native rows in publisher order; no identity join is made. */
export const filterWomensLowerDivisionRows = <T extends LowerDivisionRow>(
  rows: readonly T[],
  query: string,
  minimumGames = 0,
): T[] => {
  const needle = query.trim().toLowerCase();
  const minimum = Number.isFinite(minimumGames) && minimumGames > 0 ? minimumGames : 0;
  return rows.filter((row) => {
    if (needle && !searchText(row).includes(needle)) return false;
    const games = lowerDivisionGames(row);
    return minimum === 0 || (games != null && games >= minimum);
  });
};

export const paginateWomensLowerDivisionRows = <T>(
  rows: readonly T[],
  page: number,
  pageSize = LOWER_DIVISION_PAGE_SIZE,
): T[] => {
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : LOWER_DIVISION_PAGE_SIZE;
  const safePage = Number.isInteger(page) && page > 0 ? page : 0;
  return rows.slice(safePage * safePageSize, (safePage + 1) * safePageSize);
};
