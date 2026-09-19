export type RankingEvidenceMetric =
  | "ts"
  | "efg"
  | "per40"
  | "ast_to"
  | "stocks40"
  | "tov_rate"
  | "three_rate"
  | "three_pct"
  | "ft_pct"
  | "rim_pct"
  | "mid_pct"
  | "ft_rate"
  | "ast_rate"
  | "points_poss"
  | "orb40"
  | "drb40"
  | "reb40"
  | "poss_share"
  | "rim_rate"
  | "transition_share"
  | "unassisted_share";

export type RankingEvidenceRow = {
  points?: number | null;
  rebounds?: number | null;
  offensive_rebounds?: number | null;
  defensive_rebounds?: number | null;
  assists?: number | null;
  steals?: number | null;
  blocks?: number | null;
  turnovers?: number | null;
  minutes?: number | null;
  possessions?: number | null;
  team_possessions?: number | null;
  fga?: number | null;
  fgm?: number | null;
  tpa?: number | null;
  tpm?: number | null;
  fta?: number | null;
  ftm?: number | null;
  rim_attempts?: number | null;
  rim_makes?: number | null;
  mid_attempts?: number | null;
  mid_makes?: number | null;
  transition_points?: number | null;
  unassisted_points?: number | null;
};

export type RankingEvidence = { primary: string; detail: string };

const evidenceMetrics = new Set<string>([
  "ts", "efg", "per40", "ast_to", "stocks40", "tov_rate", "three_rate",
  "three_pct", "ft_pct", "rim_pct", "mid_pct", "ft_rate", "ast_rate",
  "points_poss", "orb40", "drb40", "reb40", "poss_share", "rim_rate",
  "transition_share", "unassisted_share",
]);

export const hasRankingEvidence = (metric: string) => evidenceMetrics.has(metric);

const available = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const count = (value: number) =>
  Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 1 });

const pair = (
  numerator: number | null | undefined,
  numeratorLabel: string,
  denominator: number | null | undefined,
  denominatorLabel: string,
): RankingEvidence | null => available(numerator) && available(denominator)
  ? { primary: `${count(numerator)} ${numeratorLabel}`, detail: `${count(denominator)} ${denominatorLabel}` }
  : null;

/**
 * Expose the exact retained inputs behind a derived ranking value. Missing
 * source fields remain unavailable so the evidence display cannot imply a
 * complete sample that the archive did not record.
 */
export function rankingEvidence(metric: string, row: RankingEvidenceRow): RankingEvidence | null {
  switch (metric as RankingEvidenceMetric) {
    case "ts":
      return available(row.points) && available(row.fga) && available(row.fta)
        ? { primary: `${count(row.points)} PTS`, detail: `${count(row.fga)} FGA + 0.475 × ${count(row.fta)} FTA` }
        : null;
    case "efg":
      return available(row.fgm) && available(row.tpm) && available(row.fga)
        ? { primary: `${count(row.fgm)} FGM + 0.5 × ${count(row.tpm)} 3PM`, detail: `${count(row.fga)} FGA` }
        : null;
    case "per40": return pair(row.points, "PTS", row.minutes, "MIN");
    case "ast_to": return pair(row.assists, "AST", row.turnovers, "TO");
    case "stocks40":
      return available(row.steals) && available(row.blocks) && available(row.minutes)
        ? { primary: `${count(row.steals + row.blocks)} STL + BLK`, detail: `${count(row.minutes)} MIN` }
        : null;
    case "tov_rate": return pair(row.turnovers, "TO", row.possessions, "POSS");
    case "three_rate": return pair(row.tpa, "3PA", row.fga, "FGA");
    case "three_pct": return pair(row.tpm, "3PM", row.tpa, "3PA");
    case "ft_pct": return pair(row.ftm, "FTM", row.fta, "FTA");
    case "rim_pct": return pair(row.rim_makes, "RIM MAKES", row.rim_attempts, "RIM ATT");
    case "mid_pct": return pair(row.mid_makes, "MID MAKES", row.mid_attempts, "MID ATT");
    case "ft_rate": return pair(row.fta, "FTA", row.fga, "FGA");
    case "ast_rate": return pair(row.assists, "AST", row.possessions, "POSS");
    case "points_poss": return pair(row.points, "PTS", row.possessions, "POSS");
    case "orb40": return pair(row.offensive_rebounds, "OREB", row.minutes, "MIN");
    case "drb40": return pair(row.defensive_rebounds, "DREB", row.minutes, "MIN");
    case "reb40": return pair(row.rebounds, "REB", row.minutes, "MIN");
    case "poss_share": return pair(row.possessions, "PLAYER POSS", row.team_possessions, "TEAM POSS");
    case "rim_rate": return pair(row.rim_attempts, "RIM ATT", row.fga, "FGA");
    case "transition_share": return pair(row.transition_points, "TRANS PTS", row.points, "PTS");
    case "unassisted_share": return pair(row.unassisted_points, "UNAST PTS", row.points, "PTS");
    default: return null;
  }
}
