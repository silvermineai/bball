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

export type DivisionArchiveSummary = {
  season: number | null;
  generated_at: string | null;
  division: LowerBasketballDivision;
  players: number;
  teams: number;
  metrics: Record<DivisionSummaryMetric, number>;
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
  return {
    season,
    generated_at,
    division,
    players: divisionPlayers.length,
    teams: divisionTeams.length,
    metrics,
  };
}
