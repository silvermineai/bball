export type LowerBasketballDivision = "2" | "3";

export const divisionSummaryMetrics = [
  ["ppg", "PPG"],
  ["rpg", "RPG"],
  ["apg", "APG"],
  ["mpg", "MPG"],
  ["fg_pct", "FG%"],
  ["three_pct", "3P%"],
] as const;

export type DivisionSummaryMetric = (typeof divisionSummaryMetrics)[number][0];

export type DivisionPlayerEvidenceCoverage = {
  exact_player_ids: number;
  names: number;
  team_ids: number;
  team_names: number;
  positions: number;
  class_years: number;
  games: number;
  source_stat_rows: number;
  source_stat_snapshots: number;
  metrics: Record<DivisionSummaryMetric, number>;
};

export type DivisionSourceMetricCoverage = {
  rows: number;
  max_rank: number | null;
  coverage_kind: "qualified_leaderboard" | string;
};

export type DivisionArchiveSummary = {
  season: number | null;
  generated_at: string | null;
  division: LowerBasketballDivision;
  players: number;
  teams: number;
  metrics: Record<DivisionSummaryMetric, number>;
  playerEvidence: DivisionPlayerEvidenceCoverage;
  sourceCoverage?: Record<string, DivisionSourceMetricCoverage>;
};

type ArchiveRow = Record<string, unknown>;

const isRecord = (value: unknown): value is ArchiveRow =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const rowId = (row: ArchiveRow, key: "player_id" | "team_ncaa_id") => {
  const value = row[key];
  return (typeof value === "string" || typeof value === "number") && String(value).trim() !== ""
    ? String(value)
    : null;
};

const rowDivision = (row: ArchiveRow) => {
  const value = row.division;
  return value === 1 || value === 2 || value === 3 || value === "1" || value === "2" || value === "3"
    ? String(value)
    : null;
};

function validateRows(value: unknown, key: "player_id" | "team_ncaa_id", label: string): ArchiveRow[] {
  if (!Array.isArray(value)) throw new Error(`Division archive has no ${label} rows.`);
  const ids = new Set<string>();
  return value.map((entry) => {
    if (!isRecord(entry) || !rowId(entry, key) || !rowDivision(entry)) {
      throw new Error(`Division archive contains a malformed ${label} row.`);
    }
    const id = rowId(entry, key)!;
    if (ids.has(id)) throw new Error(`Division archive contains duplicate ${label} IDs.`);
    ids.add(id);
    return entry;
  });
}

const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const nonBlank = (value: unknown) => typeof value === "string" ? value.trim().length > 0 : typeof value === "number" && Number.isFinite(value);

/**
 * Report the identity and source-field boundary for one exact division. The
 * archive can contain a complete player directory while only exposing a
 * bounded publisher leaderboard for some statistics; keep that distinction
 * explicit so consumers do not mistake missing values for zero production.
 */
function playerEvidenceCoverage(rows: ArchiveRow[]): DivisionPlayerEvidenceCoverage {
  const sourceStatRows = rows.filter((row) => isRecord(row.source_stats) && Object.keys(row.source_stats).length > 0).length;
  const sourceStatSnapshots = rows.reduce((count, row) => count + (isRecord(row.source_stats) ? Object.keys(row.source_stats).length : 0), 0);
  return {
    exact_player_ids: rows.filter((row) => rowId(row, "player_id") != null).length,
    names: rows.filter((row) => nonBlank(row.name)).length,
    team_ids: rows.filter((row) => rowId(row, "team_ncaa_id") != null).length,
    team_names: rows.filter((row) => nonBlank(row.team_name)).length,
    positions: rows.filter((row) => nonBlank(row.position)).length,
    class_years: rows.filter((row) => nonBlank(row.class_year)).length,
    games: rows.filter((row) => finite(row.games)).length,
    source_stat_rows: sourceStatRows,
    source_stat_snapshots: sourceStatSnapshots,
    metrics: Object.fromEntries(divisionSummaryMetrics.map(([key]) => [
      key,
      rows.filter((row) => finite(row[key])).length,
    ])) as Record<DivisionSummaryMetric, number>,
  };
}

/**
 * Summarize the checked-in NCAA individual release without filling missing
 * lower-division values. The summary is deliberately scoped to one division.
 */
export function summarizeDivisionArchive(value: unknown, division: LowerBasketballDivision): DivisionArchiveSummary {
  if (!isRecord(value)) throw new Error("Division archive is not an object.");
  const players = validateRows(value.players, "player_id", "player");
  const teams = validateRows(value.teams, "team_ncaa_id", "team");
  const divisionPlayers = players.filter((row) => rowDivision(row) === division);
  const divisionTeams = teams.filter((row) => rowDivision(row) === division);
  const metrics = Object.fromEntries(divisionSummaryMetrics.map(([key]) => [
    key,
    divisionPlayers.filter((row) => finite(row[key])).length,
  ])) as Record<DivisionSummaryMetric, number>;
  const season = finite(value.season) ? value.season as number : null;
  const generated_at = typeof value.generated_at === "string" ? value.generated_at : null;
  const coverageRoot = isRecord(value.coverage) ? value.coverage : null;
  const divisionCoverage = coverageRoot && isRecord(coverageRoot.divisions) ? coverageRoot.divisions[division] : null;
  const sourceCoverageValue = isRecord(divisionCoverage) && isRecord(divisionCoverage.source_coverage)
    ? Object.fromEntries(Object.entries(divisionCoverage.source_coverage).flatMap(([key, raw]) => {
      if (!isRecord(raw) || typeof raw.rows !== "number" || !Number.isInteger(raw.rows) || raw.rows < 0 || (raw.max_rank != null && (typeof raw.max_rank !== "number" || !Number.isInteger(raw.max_rank) || raw.max_rank < 0)) || typeof raw.coverage_kind !== "string") return [];
      return [[key, { rows: raw.rows, max_rank: raw.max_rank == null ? null : raw.max_rank, coverage_kind: raw.coverage_kind } satisfies DivisionSourceMetricCoverage]];
    })) as Record<string, DivisionSourceMetricCoverage>
    : undefined;
  return {
    season,
    generated_at,
    division,
    players: divisionPlayers.length,
    teams: divisionTeams.length,
    metrics,
    playerEvidence: playerEvidenceCoverage(divisionPlayers),
    ...(sourceCoverageValue && Object.keys(sourceCoverageValue).length ? { sourceCoverage: sourceCoverageValue } : {}),
  };
}
