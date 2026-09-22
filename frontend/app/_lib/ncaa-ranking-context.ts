export type RankingContextMetric = "balanced_index" | "ppg" | "ts" | "poss_share";

export type RankingContextRow = {
  season: number;
  metric: RankingContextMetric;
  player_id: string;
  team_id: string;
  team_name: string | null;
  player_name: string | null;
  games: number;
  minutes: number | null;
  possessions: number | null;
  team_possessions: number | null;
  fga: number | null;
  value: number | null;
  rank: number | null;
  total: number;
};

export type RankingContextSpec = {
  metric: RankingContextMetric;
  label: string;
  minGames: number;
  minMinutes: number;
  minVolume: number;
  description: string;
};

/** A small, stable set of comparison boards. Their cutoffs stay visible in the UI. */
export const rankingContextSpecs: readonly RankingContextSpec[] = [
  { metric: "balanced_index", label: "All-around", minGames: 5, minMinutes: 200, minVolume: 0, description: "Nine-component production screen" },
  { metric: "ppg", label: "Scoring", minGames: 5, minMinutes: 200, minVolume: 0, description: "Points per game" },
  { metric: "ts", label: "Efficiency", minGames: 10, minMinutes: 400, minVolume: 100, description: "True shooting with 100 FGA units" },
  { metric: "poss_share", label: "Role load", minGames: 5, minMinutes: 200, minVolume: 0, description: "Player possessions divided by team possessions" },
];

const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const count = (value: number) => Number.isInteger(value)
  ? value.toLocaleString("en-US")
  : value.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** Exact player IDs are required; substring/name matches cannot enter a comparison card. */
export function exactRankingContextRows(rows: RankingContextRow[], playerId: string): RankingContextRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (row.player_id !== playerId) return false;
    const key = `${row.player_id}:${row.team_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Keep workload and denominator evidence compact enough for a comparison card. */
export function rankingRoleContext(row: Pick<RankingContextRow, "games" | "minutes" | "possessions" | "team_possessions" | "fga">): string {
  const mpg = finite(row.minutes) && Number.isFinite(row.games) && row.games > 0 ? row.minutes / row.games : null;
  const share = finite(row.possessions) && finite(row.team_possessions) && row.team_possessions > 0
    && row.possessions >= 0 && row.possessions <= row.team_possessions
    ? 100 * row.possessions / row.team_possessions
    : null;
  return [
    mpg == null ? null : `MPG ${mpg.toFixed(1)}`,
    share == null ? null : `Role load ${share.toFixed(1)}% (${count(row.possessions!)} / ${count(row.team_possessions!)} poss)`,
    finite(row.fga) ? `FGA ${count(row.fga)}` : null,
  ].filter((value): value is string => value != null).join(" · ");
}

export function rankingContextLabel(spec: RankingContextSpec, row: RankingContextRow): string {
  const value = row.value == null ? "—" : spec.metric === "balanced_index" ? row.value.toFixed(2) : `${row.value.toFixed(1)}${spec.metric === "ts" || spec.metric === "poss_share" ? "%" : ""}`;
  const rank = row.rank == null || !row.total ? "Unranked" : `#${row.rank} of ${row.total.toLocaleString()}`;
  return `${spec.label}: ${value} · ${rank}`;
}
