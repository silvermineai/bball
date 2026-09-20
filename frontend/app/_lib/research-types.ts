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
  /** Distinguishes calibrated primary output from exploratory cold-start output. */
  estimate_type?: "primary" | "cold_start" | "unknown";
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
  /** Mean high-minus-low span among valid, settled forecast intervals. */
  interval_mean_width?: number | null;
  /** Reliability-bin weighted absolute forecast/observed gap. */
  expected_calibration_error?: number | null;
  reliability?: {
    lower: number;
    upper: number;
    games: number;
    predicted: number | null;
    observed: number | null;
  }[];
};
export type SportSummary = {
  games: number;
  registered_versions: number;
  /** Retained odds rows for this sport, including rows that do not qualify for comparison. */
  market_observations?: number;
  /** Feed events for this sport that could not be joined safely. */
  unmatched_events?: number;
  status_counts: Record<string, number>;
  exclusion_counts: Record<string, number>;
  metrics: Metrics;
  games_with_comparisons: number;
  /** Qualifying quote observations attached to games with verified finals. */
  settled_market_observations?: number;
  /** Qualifying quote observations attached to scheduled or awaiting-result games. */
  pending_market_observations?: number;
  qualifying_market_observations?: number;
  /** Reconciled quote funnel for the selected season/model cohort. */
  comparison_readiness?: {
    retained_observations: number;
    selected_game_observations: number;
    outside_selected_cohort: number;
    eligible_observations: number;
    comparable_observations: number;
    superseded_observations: number;
    selected_comparisons: number;
    rejection_counts: Record<string, number>;
  };
  /** Results remain separated by the model selected under the ledger policy. */
  model_metrics?: {
    model_id: string;
    selected_forecasts: number;
    eligible_forecasts: number;
    settled_games: number;
    first_registered_at: string | null;
    last_registered_at: string | null;
    margin_mae: number | null;
    total_mae: number | null;
    winner_accuracy: number | null;
    winner_picks: number;
    brier: number | null;
    log_loss: number | null;
    interval_games: number;
    interval_coverage: number | null;
    interval_mean_width?: number | null;
    expected_calibration_error?: number | null;
  }[];
  /** Performance split by output type so cold-start rows never hide inside primary-model results. */
  estimate_metrics?: {
    model_id: string;
    estimate_type: "primary" | "cold_start" | "unknown";
    selected_forecasts: number;
    eligible_forecasts: number;
    settled_games: number;
    first_registered_at: string | null;
    last_registered_at: string | null;
    margin_mae: number | null;
    total_mae: number | null;
    winner_accuracy: number | null;
    winner_picks: number;
    brier: number | null;
    log_loss: number | null;
    interval_games: number;
    interval_coverage: number | null;
    interval_mean_width?: number | null;
    expected_calibration_error?: number | null;
  }[];
  market_metrics: {
    /** Exact forecast edition evaluated against this market cohort. */
    model_id?: string;
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

export type MarketEvidenceState = "none" | "retained_unqualified" | "qualified" | "inconsistent";

/**
 * Keep an archived quote distinct from a quote that survived the scorecard's
 * forecast-registration, participant, kickoff, and freshness checks.
 *
 * A qualifying count without any retained rows is an invalid ledger state. It
 * must not be rendered as evidence of a usable market quote.
 */
export function marketEvidenceState(
  retained: number | null | undefined,
  qualifying: number | null | undefined,
): MarketEvidenceState {
  const retainedCount = typeof retained === "number" && Number.isFinite(retained) ? retained : 0;
  const qualifyingCount = typeof qualifying === "number" && Number.isFinite(qualifying) ? qualifying : 0;
  if (qualifyingCount > 0 && retainedCount <= 0) return "inconsistent";
  if (qualifyingCount > 0) return "qualified";
  if (retainedCount > 0) return "retained_unqualified";
  return "none";
}

export type ModelEditionMetric = NonNullable<SportSummary["model_metrics"]>[number];

export type ModelReliabilityScope = {
  current: ModelEditionMetric | null;
  editionCount: number;
  aggregateSettled: number;
  priorSettled: number;
  /** Whether the current edition was checked against the live forecast catalog. */
  lineage: "unverified" | "matched" | "mismatch" | "unavailable";
  authoritativeModelId: string | null;
};

/** Identify the newest registered edition before describing aggregate reliability. */
export function modelReliabilityScope(
  summary: Pick<SportSummary, "metrics" | "model_metrics">,
  authoritativeModelId?: string | null,
): ModelReliabilityScope {
  const editions = summary.model_metrics || [];
  const current = authoritativeModelId === undefined
    ? editions.reduce<ModelEditionMetric | null>((latest, edition) => {
      if (!latest) return edition;
      const latestClock = latest.first_registered_at || latest.last_registered_at || "";
      const editionClock = edition.first_registered_at || edition.last_registered_at || "";
      return editionClock > latestClock ? edition : latest;
    }, null)
    : authoritativeModelId
      ? editions.find((edition) => edition.model_id === authoritativeModelId) || null
      : null;
  const aggregateSettled = summary.metrics.games;
  const lineage = authoritativeModelId === undefined
    ? "unverified"
    : authoritativeModelId === null
      ? "unavailable"
      : current
        ? "matched"
        : "mismatch";
  return {
    current,
    editionCount: editions.length,
    aggregateSettled,
    priorSettled: Math.max(0, aggregateSettled - (current?.settled_games || 0)),
    lineage,
    authoritativeModelId: authoritativeModelId ?? null,
  };
}

export type Ledger = {
  generated_at: string;
  policy: string;
  sports: Record<"football" | "basketball", SportSummary>;
  games: LedgerGame[];
  /** All immutable registrations; older editions may omit this field. */
  versions?: LedgerVersion[];
  market_observations: number;
  /** Rows that pass the selected forecast's game, clock and freshness rules. */
  qualifying_market_observations?: number;
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
  forecast_excluded: "Selected forecast is ineligible",
  invalid_payload: "Malformed quote payload",
  captured_before_registration: "Captured before forecast registration",
  captured_after_start: "Captured at or after tip",
  updated_after_capture: "Provider update follows capture",
  captured_in_future: "Capture clock is in the future",
  updated_after_start: "Provider update is at or after tip",
  stale_at_capture: "Provider quote was over 24 hours old",
  invalid_prices: "Missing or invalid paired prices",
  missing_model_output: "Required model or line value is missing",
  unsupported_market: "Unsupported market type",
};
