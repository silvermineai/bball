export type NCAAIndividualPlayer = {
  player_id: number;
  division: 1 | 2 | 3;
  name: string;
  team_name: string | null;
  team_ncaa_id: number | null;
  conference: string | null;
  class_year: string | null;
  height: string | null;
  position: string | null;
  games: number | null;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  spg: number | null;
  bpg: number | null;
  fg_pct: number | null;
  three_pct: number | null;
  ft_pct: number | null;
  threes_pg: number | null;
  mpg: number | null;
  ast_to: number | null;
  dbl_dbl: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  fgm: number | null;
  fga: number | null;
  three_fgm: number | null;
  three_fga: number | null;
  ftm: number | null;
  ppg_rank: number | null;
  rpg_rank: number | null;
  apg_rank: number | null;
};

export type NCAAIndividualRelease = {
  schema_version: 1;
  season: number;
  generated_at: string | null;
  attribution: { publisher: string; source: string; method: string };
  coverage: {
    players: number;
    divisions: Record<string, { players: number; ppg: number; rpg: number; apg: number; mpg: number }>;
  };
  players: NCAAIndividualPlayer[];
};

export type NCAAStatKey =
  | "ppg"
  | "rpg"
  | "apg"
  | "spg"
  | "bpg"
  | "fg_pct"
  | "three_pct"
  | "ft_pct"
  | "threes_pg"
  | "mpg"
  | "ast_to"
  | "dbl_dbl"
  | "pts"
  | "reb"
  | "ast"
  | "fgm"
  | "fga"
  | "three_fgm"
  | "three_fga"
  | "ftm";

export const ncaaStatLabels: Record<NCAAStatKey, string> = {
  ppg: "Points per game",
  rpg: "Rebounds per game",
  apg: "Assists per game",
  spg: "Steals per game",
  bpg: "Blocks per game",
  fg_pct: "Field-goal percentage",
  three_pct: "Three-point percentage",
  ft_pct: "Free-throw percentage",
  threes_pg: "Threes per game",
  mpg: "Minutes per game",
  ast_to: "Assist / turnover ratio",
  dbl_dbl: "Double-doubles",
  pts: "Total points",
  reb: "Total rebounds",
  ast: "Total assists",
  fgm: "Field goals made",
  fga: "Field goals attempted",
  three_fgm: "Three-pointers made",
  three_fga: "Three-pointers attempted",
  ftm: "Free throws made",
};

export type NCAAValueCoverage = {
  stat: NCAAStatKey;
  divisions: Record<1 | 2 | 3, number>;
};

/** Count published numeric values without treating an absent source field as zero. */
export function ncaaValueCoverage(
  rows: NCAAIndividualPlayer[],
  keys: NCAAStatKey[] = Object.keys(ncaaStatLabels) as NCAAStatKey[],
): NCAAValueCoverage[] {
  return keys.map((stat) => ({
    stat,
    divisions: {
      1: rows.filter((row) => row.division === 1 && row[stat] != null).length,
      2: rows.filter((row) => row.division === 2 && row[stat] != null).length,
      3: rows.filter((row) => row.division === 3 && row[stat] != null).length,
    },
  }));
}

export function sortNCAAPlayers(rows: NCAAIndividualPlayer[], stat: NCAAStatKey) {
  return [...rows].sort((a, b) => {
    const av = a[stat];
    const bv = b[stat];
    if (av == null && bv == null) return a.name.localeCompare(b.name) || a.player_id - b.player_id;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av || a.name.localeCompare(b.name) || a.player_id - b.player_id;
  });
}
