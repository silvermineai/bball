export type DivisionPlayer = {
  player_id: string | number;
  division: string | number;
  name: string;
  team_name?: string | null;
  conference?: string | null;
  class_year?: string | null;
  position?: string | null;
  games?: number | null;
  ppg?: number | null;
  rpg?: number | null;
  apg?: number | null;
  spg?: number | null;
  bpg?: number | null;
  mpg?: number | null;
  fg_pct?: number | null;
  three_pct?: number | null;
  ft_pct?: number | null;
  threes_pg?: number | null;
  ast_to?: number | null;
  dbl_dbl?: number | null;
  pts?: number | null;
  reb?: number | null;
  ast?: number | null;
  stl?: number | null;
  blk?: number | null;
  tov?: number | null;
  orb?: number | null;
  drb?: number | null;
  pf?: number | null;
  o_poss?: number | null;
  tpm?: number | null;
  tpa?: number | null;
  mins?: number | null;
  fgm?: number | null;
  fga?: number | null;
  three_fgm?: number | null;
  three_fga?: number | null;
  ftm?: number | null;
  fta?: number | null;
  /** Exact cells retained from the publisher's source row, when present. */
  source_stats?: Record<string, {
    headers: string[];
    cells: string[];
    rank: number | null;
    value: number | null;
  }>;
  [key: string]: unknown;
};

export const divisionRankingMetrics = [
  ["ppg", "PPG", "Points per game"],
  ["rpg", "RPG", "Rebounds per game"],
  ["apg", "APG", "Assists per game"],
  ["spg", "SPG", "Steals per game"],
  ["bpg", "BPG", "Blocks per game"],
  ["mpg", "MPG", "Minutes per game"],
  ["fg_pct", "FG%", "Field-goal percentage"],
  ["three_pct", "3P%", "Three-point percentage"],
  ["ft_pct", "FT%", "Free-throw percentage"],
  ["threes_pg", "3PG", "Three-pointers per game"],
  ["ast_to", "A/TO", "Assist-to-turnover ratio"],
  ["dbl_dbl", "DD", "Double-doubles"],
  ["pts", "PTS", "Recorded total points"],
  ["reb", "REB", "Recorded total rebounds"],
  ["ast", "AST", "Recorded total assists"],
  ["stl", "STL", "Recorded total steals"],
  ["blk", "BLK", "Recorded total blocks"],
  ["tov", "TO", "Recorded total turnovers"],
  ["pf", "PF", "Recorded personal fouls"],
  ["orb", "ORB", "Recorded offensive rebounds"],
  ["drb", "DRB", "Recorded defensive rebounds"],
  ["fgm", "FGM", "Recorded field goals made"],
  ["fga", "FGA", "Recorded field-goal attempts"],
  ["three_fgm", "3PM", "Recorded three-pointers made"],
  ["three_fga", "3PA", "Recorded three-point attempts"],
  ["ftm", "FTM", "Recorded free throws made"],
  ["fta", "FTA", "Recorded free-throw attempts"],
  ["tpm", "3PM box", "Recorded box-score three-pointers made"],
  ["tpa", "3PA box", "Recorded box-score three-point attempts"],
  ["mins", "MIN", "Recorded total minutes"],
  ["o_poss", "POSS", "Recorded offensive possessions"],
] as const;

export type DivisionRankingMetric = (typeof divisionRankingMetrics)[number][0];

export type DivisionRankedPlayer = DivisionPlayer & {
  value: number;
  rank: number;
  source_rank: number | null;
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function divisionMetricLabel(metric: DivisionRankingMetric): string {
  return divisionRankingMetrics.find(([key]) => key === metric)?.[2] || metric;
}

export function divisionMetricValue(player: DivisionPlayer, metric: DivisionRankingMetric): number | null {
  const value = player[metric];
  return finite(value) ? value : null;
}

export type DivisionMetricCoverage = {
  divisionRows: number;
  gameQualifiedRows: number;
  valueRows: number;
  missingValueRows: number;
};

/** Keep the selected metric denominator visible without treating missing source values as zero. */
export function divisionMetricCoverage(
  players: readonly DivisionPlayer[],
  options: { division: "2" | "3"; metric: DivisionRankingMetric; query?: string; minGames?: number },
): DivisionMetricCoverage {
  const query = options.query?.trim().toLowerCase() || "";
  const minGames = Number.isFinite(options.minGames) ? Math.max(0, options.minGames || 0) : 0;
  const divisionRows = players.filter((player) => String(player.division) === options.division);
  const searchedRows = divisionRows.filter((player) => !query || `${player.name} ${player.team_name || ""} ${player.conference || ""} ${player.player_id}`.toLowerCase().includes(query));
  const gameQualifiedRows = searchedRows.filter((player) => finite(player.games) && player.games >= minGames);
  const valueRows = gameQualifiedRows.filter((player) => divisionMetricValue(player, options.metric) != null).length;
  return {
    divisionRows: divisionRows.length,
    gameQualifiedRows: gameQualifiedRows.length,
    valueRows,
    missingValueRows: gameQualifiedRows.length - valueRows,
  };
}

export function divisionSourceRank(player: DivisionPlayer, metric: DivisionRankingMetric): number | null {
  const value = player[`${metric}_rank`];
  return finite(value) && value > 0 ? value : null;
}

export function rankDivisionPlayers(
  players: DivisionPlayer[],
  options: {
    division: "2" | "3";
    metric: DivisionRankingMetric;
    query?: string;
    minGames?: number;
    limit?: number;
  },
): { rows: DivisionRankedPlayer[]; total: number } {
  const query = options.query?.trim().toLowerCase() || "";
  const minGames = Number.isFinite(options.minGames) ? Math.max(0, options.minGames || 0) : 0;
  const qualified = players
    .filter((player) => String(player.division) === options.division)
    .filter((player) => {
      const games = player.games;
      return finite(games) && games >= minGames;
    })
    .filter((player) => !query || `${player.name} ${player.team_name || ""} ${player.conference || ""} ${player.player_id}`.toLowerCase().includes(query))
    .map((player) => ({ player, value: divisionMetricValue(player, options.metric) }))
    .filter((row): row is { player: DivisionPlayer; value: number } => row.value != null)
    .sort((left, right) => right.value - left.value || left.player.name.localeCompare(right.player.name) || String(left.player.player_id).localeCompare(String(right.player.player_id)));
  const limit = options.limit == null ? qualified.length : Math.max(0, options.limit);
  // This is a statistical ranking, so equal recorded values must share the
  // same rank. Use competition ranking (1, 1, 3) and calculate it before the
  // display limit so a bounded board cannot change a player's rank.
  let previousValue: number | null = null;
  let competitionRank = 0;
  const ranked = qualified.map(({ player, value }, index) => {
    if (previousValue === null || value !== previousValue) {
      competitionRank = index + 1;
      previousValue = value;
    }
    return {
      ...player,
      value,
      rank: competitionRank,
      source_rank: divisionSourceRank(player, options.metric),
    };
  });
  return {
    total: qualified.length,
    rows: ranked.slice(0, limit),
  };
}
