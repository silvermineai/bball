import type { BBGame, BBPlayer, BBTeam } from "./basketball-types";
export type Metric = {
  value: number | null;
  games: number;
  rank?: number;
  population?: number;
  percentile?: number;
};
export type MetricDef = {
  label: string;
  format: "percent" | "points";
  higher_better: boolean | null;
  description: string;
};
export type Split = {
  games: number;
  scored_games: number;
  paired_games: number;
  wins: number;
  losses: number;
  ties: number;
  pace: number | null;
  close_games: number;
  close_wins: number;
  sos: number | null;
  sos_games: number;
  metrics: Record<string, Metric>;
};
export const splitLabels = {
  season: "Full season",
  last10: "Last 10 games",
  last5: "Last 5 games",
  home: "Home games",
  road: "Road games",
  neutral: "Neutral games",
  top50: "Against current top 50",
};
export type SplitKey = keyof typeof splitLabels;
export type ScoutGame = {
  id: string;
  starts_at: string;
  season: number;
  opponent_id: string;
  opponent: string;
  opponent_rank: number | null;
  opponent_net: number | null;
  location: string;
  score: number | null;
  allowed: number | null;
  result: string | null;
  possessions: number | null;
  pace: number | null;
  rates: Record<string, number>;
};
export type ScoutPlayer = BBPlayer & {
  usage_est?: number | null;
  usage_games?: number;
  minutes_share?: number | null;
  workload_games?: number;
  assist_turnover_ratio?: number | null;
  assist_turnover_games?: number;
  three_attempts?: number | null;
  three_attempt_games?: number;
};
export type ScoutTeam = {
  id: string;
  name: string;
  season: number;
  rating: BBTeam;
  splits: Record<SplitKey, Split>;
  games: ScoutGame[];
  players: ScoutPlayer[];
  upcoming: BBGame[];
};
export type ScoutMeta = {
  season: number;
  forecast_season: number;
  generated_at: string;
  source_edition: string;
  model_id: string;
  metrics: Record<string, MetricDef>;
};
export type ScoutProfile = ScoutTeam & ScoutMeta;
export type ScoutIndex = ScoutMeta & {
  teams: {
    id: string;
    name: string;
    season: number;
    rating: BBTeam;
    record: {
      wins: number;
      losses: number;
      ties: number;
      games: number;
      paired_games: number;
    };
  }[];
};
export const fourFactors = [
  "off_efg",
  "def_efg",
  "off_tov",
  "def_tov",
  "off_orb",
  "def_orb",
  "off_ftr",
  "def_ftr",
];
