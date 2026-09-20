export type PlayerStatCoverageInput = {
  team_id: string;
  stats: Record<string, number | null | undefined>;
};

export type PlayerStatCoverageStatus = "complete" | "partial" | "unavailable";

export type PlayerStatCoverageField = {
  key: string;
  observedRows: number;
  missingRows: number;
  zeroRows: number;
  rowCount: number;
  status: PlayerStatCoverageStatus;
};

export type PlayerStatCoverageGroup = {
  key: string;
  label: string;
  fields: PlayerStatCoverageField[];
};

const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const fieldGroup = (key: string) => {
  if (["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta"].includes(key)) return "scoring";
  if (["mins", "o_poss", "ast", "tov", "orb", "drb", "pf"].includes(key)) return "possession";
  if (["rimm", "rima", "midm", "mida", "pbackm", "pbacka"].includes(key)) return "shot-zone";
  if (key.endsWith("_half") || key.endsWith("_trans") || key.endsWith("_unast") || key.endsWith("_ast")) return "context";
  return "other";
};

const GROUPS: Record<string, string> = {
  scoring: "Scoring and shooting",
  possession: "Possession and workload",
  "shot-zone": "Shot zones",
  context: "Play context",
  other: "Other retained fields",
};

const groupOrder = ["scoring", "possession", "shot-zone", "context", "other"];

/**
 * Audit every retained numeric field for one exact player ID and selected
 * season. A source-recorded zero counts as observed evidence; null, undefined,
 * nonnumeric and nonfinite values remain missing. Team stints are preserved in
 * the denominator so a partial transfer season cannot look complete.
 */
export function buildPlayerStatCoverage(
  rows: readonly PlayerStatCoverageInput[],
): PlayerStatCoverageGroup[] {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row.stats)))].sort();
  const fields = keys.map((key): PlayerStatCoverageField => {
    const observedRows = rows.reduce((count, row) => count + (finite(row.stats[key]) ? 1 : 0), 0);
    const zeroRows = rows.reduce((count, row) => count + (row.stats[key] === 0 ? 1 : 0), 0);
    const missingRows = rows.length - observedRows;
    return {
      key,
      observedRows,
      missingRows,
      zeroRows,
      rowCount: rows.length,
      status: observedRows === 0 ? "unavailable" : observedRows === rows.length ? "complete" : "partial",
    };
  });
  return groupOrder
    .map((key) => ({ key, label: GROUPS[key], fields: fields.filter((field) => fieldGroup(field.key) === key) }))
    .filter((group) => group.fields.length > 0);
}

export const playerStatCoverageLabel = (status: PlayerStatCoverageStatus) =>
  status === "complete" ? "Complete" : status === "partial" ? "Partial" : "Unavailable";
