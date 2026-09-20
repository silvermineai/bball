import type { DivisionPlayer } from "./division-player-rankings";

export type DivisionPlayerDetailKind = "count" | "minutes" | "rate";

export type DivisionPlayerDetailField = readonly [
  key: string,
  label: string,
  kind: DivisionPlayerDetailKind,
];

/**
 * Season fields retained in the NCAA individual release but previously hidden
 * by the compact lower-division table. These are source totals or rates; the
 * view must never derive a value when the release left it absent.
 */
export const divisionPlayerDetailGroups: ReadonlyArray<{
  label: string;
  fields: readonly DivisionPlayerDetailField[];
}> = [
  {
    label: "Box totals",
    fields: [
      ["pts", "Points", "count"],
      ["reb", "Rebounds", "count"],
      ["ast", "Assists", "count"],
      ["stl", "Steals", "count"],
      ["blk", "Blocks", "count"],
      ["tov", "Turnovers", "count"],
      ["orb", "Offensive rebounds", "count"],
      ["drb", "Defensive rebounds", "count"],
      ["pf", "Personal fouls", "count"],
      ["dbl_dbl", "Double-doubles", "count"],
      ["mins", "Minutes", "minutes"],
    ],
  },
  {
    label: "Shooting totals",
    fields: [
      ["fgm", "Field goals made", "count"],
      ["fga", "Field goals attempted", "count"],
      ["three_fgm", "3-pointers made", "count"],
      ["three_fga", "3-pointers attempted", "count"],
      ["ftm", "Free throws made", "count"],
      ["fta", "Free throws attempted", "count"],
      ["tpm", "3-pointers made (box total)", "count"],
      ["tpa", "3-pointers attempted (box total)", "count"],
    ],
  },
  {
    label: "Rates and possessions",
    fields: [
      ["o_poss", "Offensive possessions", "count"],
      ["fg_pct", "Field-goal percentage", "rate"],
      ["three_pct", "3-point percentage", "rate"],
      ["ft_pct", "Free-throw percentage", "rate"],
      ["ast_to", "Assist / turnover ratio", "rate"],
      ["ppg", "Points per game", "rate"],
      ["rpg", "Rebounds per game", "rate"],
      ["apg", "Assists per game", "rate"],
      ["threes_pg", "3-pointers per game", "rate"],
      ["mpg", "Minutes per game", "rate"],
    ],
  },
];

export type DivisionPlayerSourceEvidence = {
  headers: string[];
  cells: string[];
  rank: number | null;
  value: number | null;
};

export type DivisionPlayerWithEvidence = DivisionPlayer & {
  source_stats?: Record<string, DivisionPlayerSourceEvidence>;
};

/** Read only finite numeric values from a retained player row. */
export function retainedPlayerValue(
  player: DivisionPlayer,
  key: string,
): number | null {
  const value = player[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Count populated fields without treating a missing source field as zero. */
export function retainedPlayerDetailCount(player: DivisionPlayer): number {
  return divisionPlayerDetailGroups
    .flatMap((group) => group.fields)
    .filter(([key]) => retainedPlayerValue(player, key) != null).length;
}

/**
 * Sort a lower-division player table by a retained field without collapsing a
 * recorded zero into the unavailable bucket. Missing values remain at the
 * bottom and ties use the stable source identity for deterministic paging.
 */
export function sortDivisionPlayers(
  players: readonly DivisionPlayer[],
  metric: string,
): DivisionPlayer[] {
  return [...players].sort((left, right) => {
    const leftValue = retainedPlayerValue(left, metric);
    const rightValue = retainedPlayerValue(right, metric);
    if (leftValue == null && rightValue != null) return 1;
    if (leftValue != null && rightValue == null) return -1;
    if (leftValue != null && rightValue != null && rightValue !== leftValue) {
      return rightValue - leftValue;
    }
    return left.name.localeCompare(right.name)
      || String(left.player_id).localeCompare(String(right.player_id));
  });
}
