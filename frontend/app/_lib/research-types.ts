export type Comparison = {
  /** Immutable audit_markets row key retained with the derived comparison. */
  market_observation_id?: string | null;
  /** Source event key; kept separate from the forecast registration game ID. */
  market_game_id?: string | null;
  provider: string;
  bookmaker: string;
  market: "spreads" | "totals" | "h2h";
  captured_at: string;
  updated_at: string;
  line: number | null;
  /** Decimal prices retained with the quoted line; only the fields matching
   * the market are populated. */
  home_price?: number | null;
  away_price?: number | null;
  over_price?: number | null;
  under_price?: number | null;
  model_difference: number;
  market_home_probability: number | null;
  market_overround?: number;
  model_absolute_error?: number;
  market_absolute_error?: number;
  direction_result?: string;
  model_brier?: number;
  market_brier?: number;
  model_winner_correct?: boolean;
  market_winner_correct?: boolean;
};
export type LedgerGame = {
  id: string;
  sport: "football" | "basketball";
  game_id: string;
  model_id: string;
  generated_at: string;
  registered_at: string;
  starts_at: string;
  /** Canonical schedule instant retained when a source clock resolves a TBD row. */
  canonical_starts_at?: string | null;
  /** Exact source-confirmed start used for comparison eligibility, when available. */
  source_starts_at?: string | null;
  source_time_valid?: boolean | null;
  source_observed_at?: string | null;
  /** Canonical schedule flag, retained even when an exact source clock resolves a TBD row. */
  canonical_time_tbd?: number;
  /** Explains whether the displayed start came from the immutable source clock or canonical schedule. */
  schedule_time_basis?: "canonical_schedule" | "validated_source_clock" | "source_clock_rejected";
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
  /**
   * Per-game market state from the scorecard's timing, identity and model
   * gates. This prevents an empty comparison list from being rendered as a
   * zero model-to-market gap.
   */
  market_readiness?: {
    status: "available" | "no_qualified_line" | "forecast_excluded";
    message: string;
    retained_observations: number;
    eligible_observations: number;
    comparable_observations: number;
    selected_comparisons: number;
    rejection_counts: Record<string, number>;
  };
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
    model_winner_accuracy?: number | null;
    market_winner_accuracy?: number | null;
    direction_results: Record<string, number>;
  }[];
  /**
   * Upcoming and awaiting-result quote cohorts. These describe current model
   * versus line differences, but deliberately contain no accuracy metrics.
   */
  pending_market_metrics?: {
    model_id?: string;
    provider: string;
    bookmaker: string;
    market: string;
    games: number;
    model_difference_mean: number | null;
    market_overround_mean: number | null;
    direction_results: Record<string, number>;
  }[];
};

export type MarketEvidenceState = "none" | "retained_unqualified" | "qualified" | "inconsistent";

export type ModelMarketComparisonState =
  | "checking"
  | "unavailable"
  | "no_active_edition"
  | "no_capture"
  | "no_matching_quotes"
  | "pending_settlement"
  | "settled_comparisons";

export type ModelMarketComparisonScope = {
  state: ModelMarketComparisonState;
  model_id: string | null;
  retained_observations: number;
  settled_comparisons: number;
  pending_comparisons: number;
};

function nonNegativeCount(value: number | null | undefined): number {
  return Number.isInteger(value) && (value ?? 0) >= 0 ? value ?? 0 : 0;
}

function modelMetricMatches(modelId: string, metric: { model_id?: string }): boolean {
  return typeof metric.model_id === "string" && metric.model_id === modelId;
}

/**
 * Classify market evidence for the immutable forecast edition currently shown
 * by the scorecard. Aggregate archive rows can predate the active model, so a
 * non-empty archive must not be presented as an active model comparison.
 */
export function modelMarketComparisonScope(
  summary: Pick<SportSummary, "market_observations" | "model_metrics" | "market_metrics" | "pending_market_metrics">,
  modelId: string | null | undefined,
): ModelMarketComparisonScope {
  const retained = nonNegativeCount(summary.market_observations);
  if (modelId === undefined) {
    return { state: "checking", model_id: null, retained_observations: retained, settled_comparisons: 0, pending_comparisons: 0 };
  }
  if (modelId === null) {
    return { state: "unavailable", model_id: null, retained_observations: retained, settled_comparisons: 0, pending_comparisons: 0 };
  }
  const activeEdition = (summary.model_metrics || []).find((metric) => metric.model_id === modelId);
  if (!activeEdition) {
    return { state: "no_active_edition", model_id: modelId, retained_observations: retained, settled_comparisons: 0, pending_comparisons: 0 };
  }
  const settled = (summary.market_metrics || [])
    .filter((metric) => modelMetricMatches(modelId, metric))
    .reduce((total, metric) => total + nonNegativeCount(metric.games), 0);
  const pending = (summary.pending_market_metrics || [])
    .filter((metric) => modelMetricMatches(modelId, metric))
    .reduce((total, metric) => total + nonNegativeCount(metric.games), 0);
  const state: ModelMarketComparisonState = settled > 0
    ? "settled_comparisons"
    : pending > 0
      ? "pending_settlement"
      : retained > 0
        ? "no_matching_quotes"
        : "no_capture";
  return { state, model_id: modelId, retained_observations: retained, settled_comparisons: settled, pending_comparisons: pending };
}

export function modelMarketComparisonLabel(state: ModelMarketComparisonState): string {
  switch (state) {
    case "checking": return "Checking active model";
    case "unavailable": return "Active model unavailable";
    case "no_active_edition": return "No matching active edition";
    case "no_capture": return "No retained market evidence";
    case "no_matching_quotes": return "No quote matched active model";
    case "pending_settlement": return "Quotes awaiting finals";
    case "settled_comparisons": return "Settled comparisons available";
  }
}

export function modelMarketComparisonDetail(scope: ModelMarketComparisonScope): string {
  switch (scope.state) {
    case "checking":
      return "The scorecard is waiting for the immutable active model edition before classifying market evidence.";
    case "unavailable":
      return "The live forecast catalog could not be verified, so active model-to-market readiness remains unavailable.";
    case "no_active_edition":
      return "The live catalog has no matching model edition in the selected scorecard cohort; comparisons remain withheld.";
    case "no_capture":
      return "No retained market observation is available for this active model edition. No line or model edge is inferred.";
    case "no_matching_quotes":
      return `${scope.retained_observations.toLocaleString()} market observations are retained in the archive, but none passed the exact active-model, game identity, and pregame timing gates.`;
    case "pending_settlement":
      return `${scope.pending_comparisons.toLocaleString()} qualifying market observations are attached to the active model and await verified finals; no accuracy claim is made yet.`;
    case "settled_comparisons":
      return `${scope.settled_comparisons.toLocaleString()} qualifying market observations are attached to the active model and have settled results${scope.pending_comparisons ? `; ${scope.pending_comparisons.toLocaleString()} more await finals` : ""}.`;
  }
}

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
  missing_market_identity: "Provider or bookmaker identity missing",
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
