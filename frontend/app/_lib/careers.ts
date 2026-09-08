export type CareerCoverage = {
  season: number;
  edition: string;
  source_rows: number;
  missing_identity: number;
  wrong_season: number;
  duplicate_rows: number;
  identified_rows: number;
  schedule_matched_rows: number;
  appearance_rows: number;
  dnp_rows: number;
  invalid_stat_rows: number;
  player_ids: number;
  player_team_entries: number;
  qualified_entries: number;
  schedule_games: number;
  completed_schedule_games: number;
  box_games: number;
  appearance_games: number;
};
export type CareerSource = {
  dataset: string;
  season: number;
  url: string;
  fetched_at: string;
  sha256: string;
};
export type CareerCatalog = {
  generated_at: string;
  player_ids: number;
  seasons: CareerCoverage[];
  sources: CareerSource[][];
  limitations: string[];
};
export type StatKey =
  | "min"
  | "pts"
  | "fgm"
  | "fga"
  | "tpm"
  | "tpa"
  | "ftm"
  | "fta"
  | "orb"
  | "drb"
  | "reb"
  | "ast"
  | "stl"
  | "blk"
  | "tov"
  | "pf";
export type CareerSummary = {
  games: number;
  source_records: number;
  totals: Record<StatKey, number | null>;
  samples: Record<StatKey, number>;
  incomplete_box_games: number;
  dnp_records: number;
  excluded_records: number;
  qualified: boolean;
  mpg: number | null;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  spg: number | null;
  bpg: number | null;
  topg: number | null;
  efg: number | null;
  ts: number | null;
  three_pct: number | null;
  ft_pct: number | null;
  ft_rate: number | null;
  tov_rate: number | null;
  three_rate: number | null;
};
export type CareerProfile = {
  id: string;
  name: string;
  position: string | null;
  season: number;
  edition: string;
  teams: (CareerSummary & { team_id: string; team: string })[];
  overall: CareerSummary;
};
export type CareerLog = {
  id: string;
  team_id: string;
  team: string;
  opponent_id: string | null;
  opponent: string | null;
  date: string | null;
  venue: "home" | "away" | "neutral" | null;
  score_for: number | null;
  score_against: number | null;
  schedule_matched: boolean;
  completed: boolean;
  appearance: boolean;
  dnp: boolean | null;
  starter: boolean | null;
  stats: Record<StatKey, number | null>;
  issues: string[];
};
export type CareerData = {
  id: string;
  season: number;
  edition: string;
  profiles: CareerProfile[];
  rows: CareerLog[];
  sources: CareerSource[];
  coverage: CareerCoverage;
  core?: Array<{ season: number; profile: Record<string, string> }>;
};
export const seasonLabel = (year: number) =>
  `${year - 1}–${String(year).slice(-2)}`;
export const historyMetricLabels = {
  ppg: "Points per game",
  mpg: "Minutes per game",
  ts: "True shooting",
};
export function careerPoints(
  profiles: CareerProfile[],
  metric: keyof typeof historyMetricLabels,
) {
  return [...profiles]
    .sort((a, b) => a.season - b.season)
    .map((p) => ({
      season: p.season,
      value: p.overall[metric],
      games: p.overall.games,
      teams: p.teams
        .filter((t) => t.games > 0)
        .map((t) => t.team)
        .join(" / "),
    }));
}
export function sourceNames(profiles: CareerProfile[]) {
  return [...new Set(profiles.map((p) => p.name))];
}

export function identityReview(profiles: CareerProfile[]) {
  const names = new Set(
    profiles.map((p) =>
      p.name
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, ""),
    ),
  );
  const years = profiles.map((p) => p.season);
  return (
    names.size > 1 ||
    (years.length > 1 && Math.max(...years) - Math.min(...years) > 8)
  );
}
export function rankProduction<
  T extends { name: string; id: string; team_id: string },
>(players: T[], value: (player: T) => number | null) {
  const sorted = [...players].sort(
    (a, b) =>
      (value(b) ?? -Infinity) - (value(a) ?? -Infinity) ||
      a.name.localeCompare(b.name) ||
      a.team_id.localeCompare(b.team_id),
  );
  let rank = 0,
    previous: number | null = null;
  return sorted.map((p, index) => {
    const current = value(p);
    if (current === null) return { ...p, statRank: null };
    if (current !== previous) rank = index + 1;
    previous = current;
    return { ...p, statRank: rank };
  });
}
