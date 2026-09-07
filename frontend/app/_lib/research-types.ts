export type Comparison = {
  provider: string;
  bookmaker: string;
  market: "spreads" | "totals" | "h2h";
  captured_at: string;
  updated_at: string;
  line: number | null;
  model_difference: number;
  market_home_probability: number | null;
  market_overround?: number;
  model_absolute_error?: number;
  market_absolute_error?: number;
  direction_result?: string;
  model_brier?: number;
  market_brier?: number;
};
export type LedgerGame = {
  id: string;
  sport: "football" | "basketball";
  game_id: string;
  model_id: string;
  generated_at: string;
  registered_at: string;
  starts_at: string;
  time_tbd: number;
  home_name: string;
  away_name: string;
  season: number;
  home_margin: number;
  total: number;
  home_win_probability: number;
  margin_low: number | null;
  margin_high: number | null;
  status: string;
  exclusion: string | null;
  actual_margin: number | null;
  actual_total: number | null;
  comparisons: Comparison[];
};
export type LedgerVersion = LedgerGame;
export type Metrics = {
  games: number;
  binary_games: number;
  margin_mae: number | null;
  total_mae: number | null;
  winner_accuracy: number | null;
  winner_picks: number;
  brier: number | null;
  log_loss: number | null;
  interval_games: number;
  interval_coverage: number | null;
};
export type SportSummary = {
  games: number;
  registered_versions: number;
  status_counts: Record<string, number>;
  exclusion_counts: Record<string, number>;
  metrics: Metrics;
  games_with_comparisons: number;
  market_metrics: {
    provider: string;
    bookmaker: string;
    market: string;
    games: number;
    model_mae: number | null;
    market_mae: number | null;
    model_brier: number | null;
    market_brier: number | null;
    direction_results: Record<string, number>;
  }[];
};
export type Ledger = {
  generated_at: string;
  policy: string;
  sports: Record<"football" | "basketball", SportSummary>;
  games: LedgerGame[];
  /** All immutable registrations; older editions may omit this field. */
  versions?: LedgerVersion[];
  market_observations: number;
  unmatched_events: number;
  selection: string;
  limitations: string[];
};
export const reasons: Record<string, string> = {
  unconfirmed_start: "Start time unconfirmed",
  schedule_changed: "Scheduled start changed",
  participants_changed: "Participants changed",
  registered_after_start: "Registered after start",
  invalid_clock: "Inconsistent timestamps",
  missing_schedule: "Game missing from source",
  final_missing_scores: "Final missing scores",
  inconsistent_final: "Final before scheduled start",
  awaiting_result: "Awaiting source result",
  scheduled: "Scheduled",
  settled: "Settled",
  excluded: "Excluded",
};
