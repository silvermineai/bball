import type { MarketCaptureStatus } from "./market-availability";
import type { SportSummary } from "./research-types";

/** Build the scorecard request for the exact active forecast edition. */
export function modelScopedScorecardPath(sport: "basketball" | "football", modelId: string | null | undefined): string | null {
  const id = typeof modelId === "string" ? modelId.trim() : "";
  return id
    ? `/api/research/scorecard?sport=${sport}&model=${encodeURIComponent(id)}&limit=1`
    : null;
}

export type MarketReadinessMetadata = {
  source?: "partial" | "unavailable";
  research_receipts?: number;
  research_latest_capture_at?: string | null;
  provider_capabilities?: unknown[];
  research_capture?: {
    captured_at?: string;
    season?: number;
    horizon_days?: number;
    summary_count?: number;
    summary_with_pickcenter?: number;
    summary_with_odds?: number;
    eligible_games?: number;
    candidate_games?: number;
    capture_limit?: number;
    capture_truncated?: boolean;
    summary_fetch_failures?: number;
    accepted_markets?: number;
    rejected_records?: number;
    market_status?: MarketCaptureStatus;
  };
};

export type MarketReadinessState =
  | "checking"
  | "unavailable"
  | "unverified"
  | "captured_no_quotes"
  | "captured_rejected"
  | "captured_incomplete"
  | "validated";

/**
 * Describe the market connector without turning a missing quote into a line.
 * A receipt means a capture ran; only validated_quotes means that a quote
 * passed the capture's exact-game and timing gates.
 */
export function marketReadinessState(
  metadata: MarketReadinessMetadata | null | undefined,
  checking = false,
): MarketReadinessState {
  if (checking) return "checking";
  if (!metadata || metadata.source === "unavailable") return "unavailable";
  if (!(metadata.research_receipts || 0)) return "unverified";
  switch (metadata.research_capture?.market_status) {
    case "validated_quotes":
      return "validated";
    case "quotes_failed_validation":
      return "captured_rejected";
    case "capture_incomplete":
      return "captured_incomplete";
    case "no_eligible_summaries":
    case "no_quotes_published":
      return "captured_no_quotes";
    default:
      return "unverified";
  }
}

export function marketReadinessLabel(state: MarketReadinessState): string {
  switch (state) {
    case "checking": return "Checking capture readiness";
    case "unavailable": return "Readiness unavailable";
    case "unverified": return "Capture not qualified";
    case "captured_no_quotes": return "Capture ran · no quote qualified";
    case "captured_rejected": return "Capture ran · quotes rejected";
    case "captured_incomplete": return "Capture incomplete · retry required";
    case "validated": return "Validated quote capture available";
  }
}

/** Explain the readiness state without treating an empty capture as a quote. */
export function marketReadinessDetail(
  metadata: MarketReadinessMetadata | null | undefined,
  checking = false,
): string {
  switch (marketReadinessState(metadata, checking)) {
    case "checking":
      return "Waiting for the market metadata read before classifying quote evidence.";
    case "unavailable":
      return "Market metadata is unavailable. Quote readiness remains unverified.";
    case "unverified":
      return "No capture receipt with a classified outcome is recorded. No line is inferred from the schedule or model estimate.";
    case "captured_no_quotes":
      return "A capture ran without a validated quote. No line is inferred from an unpriced summary or an empty odds payload.";
    case "captured_rejected":
      return "A capture ran, but its published quotes failed exact-game or pregame timing checks. Comparisons remain withheld.";
    case "captured_incomplete":
      return "A capture ran, but one or more eligible game summaries could not be read. Comparisons remain withheld until a complete capture is available.";
    case "validated":
      return "At least one quote passed capture validation. Each quote still needs exact forecast registration and comparison checks.";
  }
}

/** Copy used beside the scorecard so an incomplete read cannot look like an
 * ordinary no-quote capture or invite a model-versus-line conclusion. */
export function marketReadinessScorecardNote(state: MarketReadinessState): string {
  switch (state) {
    case "validated":
      return "A capture reported at least one validated market. Each quote still needs exact forecast registration, participant identity, kickoff and freshness checks before it can enter this scorecard.";
    case "captured_rejected":
      return "A capture ran, but its published quotes failed validation. The scorecard withholds model-versus-market comparisons until exact game and pregame clock evidence passes.";
    case "captured_no_quotes":
      return "A capture ran without a validated quote. No line or model edge is inferred from the schedule or an unpriced summary.";
    case "captured_incomplete":
      return "A capture ran, but one or more eligible summaries could not be read. Retry the bounded capture before interpreting market availability; no line or model edge is inferred.";
    case "unavailable":
      return "The market metadata read is unavailable. Quote readiness and model-versus-market comparisons remain unverified.";
    case "checking":
      return "Checking the capture receipt before describing market readiness.";
    case "unverified":
      return "No validated capture receipt is recorded for this sport. Quote readiness remains unverified.";
  }
}

/** Describe what the latest public capture inspected without implying a quote. */
export function marketCaptureDiagnostic(metadata: MarketReadinessMetadata | null | undefined): string | null {
  const capture = metadata?.research_capture;
  if (capture?.summary_count == null) return null;
  const quoteSets = capture.summary_with_pickcenter ?? 0;
  const oddsPayloads = capture.summary_with_odds;
  const accepted = capture.accepted_markets;
  const rejected = capture.rejected_records;
  const eligible = capture.eligible_games;
  const failures = capture.summary_fetch_failures;
  const candidates = capture.candidate_games;
  const limit = capture.capture_limit;
  const horizon = capture.horizon_days;
  const bounded = Boolean(capture.capture_truncated) && candidates != null && eligible != null && candidates >= eligible;
  const coverage = bounded
    ? ` from a bounded request of ${eligible.toLocaleString()} of ${candidates.toLocaleString()} eligible games${limit == null ? "" : ` (limit ${limit.toLocaleString()})`}`
    : eligible == null ? "" : ` of ${eligible.toLocaleString()} eligible games`;
  return `Latest capture inspected ${capture.summary_count.toLocaleString()} future summaries${coverage}${horizon == null ? "" : ` within a ${horizon.toLocaleString()}-day window`}; ${quoteSets.toLocaleString()} contained complete quote sets${oddsPayloads == null ? "" : ` and ${oddsPayloads.toLocaleString()} had a non-empty odds payload`}${failures == null ? "" : `; ${failures.toLocaleString()} summary requests failed`}${accepted == null ? "" : `; ${accepted.toLocaleString()} markets passed validation`}${rejected == null ? "" : `; ${rejected.toLocaleString()} summaries were rejected`}.`;
}

type ComparisonReadiness = NonNullable<SportSummary["comparison_readiness"]>;

function count(value: number | null | undefined): number | null {
  return Number.isInteger(value) && (value ?? 0) >= 0 ? value ?? 0 : null;
}

/**
 * Explain how retained quote rows become model comparisons without treating
 * retained or rejected rows as usable market evidence.
 */
export function formatMarketComparisonReadiness(readiness: ComparisonReadiness | null | undefined): string {
  if (!readiness) return "";
  const retained = count(readiness.retained_observations);
  const selected = count(readiness.selected_game_observations);
  const outside = count(readiness.outside_selected_cohort);
  const eligible = count(readiness.eligible_observations);
  const comparable = count(readiness.comparable_observations);
  const superseded = count(readiness.superseded_observations);
  const selectedComparisons = count(readiness.selected_comparisons);
  if (
    retained === null ||
    selected === null ||
    outside === null ||
    eligible === null ||
    comparable === null ||
    superseded === null ||
    selectedComparisons === null
  ) return "";
  if (
    selected > retained ||
    outside !== retained - selected ||
    eligible > selected ||
    comparable > eligible ||
    superseded !== comparable - selectedComparisons
  ) return "";
  return `Comparison funnel: ${selected.toLocaleString()} of ${retained.toLocaleString()} retained quote rows matched the selected forecast cohort (${outside.toLocaleString()} outside it); ${eligible.toLocaleString()} passed pregame, participant and freshness checks; ${comparable.toLocaleString()} passed model and line validation; ${selectedComparisons.toLocaleString()} remain after provider, bookmaker and market selection${superseded ? ` (${superseded.toLocaleString()} superseded)` : ""}.`;
}
