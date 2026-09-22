export type MarketCaptureStatus =
  | "no_eligible_summaries"
  | "no_quotes_published"
  | "quotes_failed_validation"
  | "capture_incomplete"
  | "capture_blocked_policy"
  | "validated_quotes"
  | "unknown";

export function marketCaptureStatusLabel(status: MarketCaptureStatus | null | undefined): string {
  switch (status) {
    case "no_eligible_summaries":
      return "No eligible game summaries were captured";
    case "no_quotes_published":
      return "Captured summaries contained no published quotes";
    case "quotes_failed_validation":
      return "Published quotes failed exact-game or timing checks";
    case "capture_incomplete":
      return "Capture incomplete · some eligible summaries could not be read";
    case "capture_blocked_policy":
      return "Capture blocked · source policy could not be verified";
    case "validated_quotes":
      return "Validated quotes are available";
    default:
      return "Quote availability is not resolved";
  }
}

export function marketCaptureStatusDetail(status: MarketCaptureStatus | null | undefined): string {
  switch (status) {
    case "no_eligible_summaries":
      return "No upcoming game summary was eligible for this capture window.";
    case "no_quotes_published":
      return "The captured game summaries did not publish a complete market. No line is inferred.";
    case "quotes_failed_validation":
      return "A quote was seen, but it did not pass exact participants, start-time and pregame checks.";
    case "capture_incomplete":
      return "Some eligible game summaries could not be read during the capture. Quote availability remains unresolved; no line is inferred.";
    case "capture_blocked_policy":
      return "The source robots policy could not be verified, so no summary request was made. This is a capture block, not evidence that the provider had no line.";
    case "validated_quotes":
      return "At least one quote passed the exact participants, start-time and pregame checks.";
    default:
      return "The capture did not report enough detail to classify quote availability.";
  }
}

/** Give an empty capture a concrete next action without treating absence as a quote. */
export function marketCaptureNextStep(status: MarketCaptureStatus | null | undefined): string {
  switch (status) {
    case "no_eligible_summaries":
      return "Wait for a confirmed future game window, then run the bounded capture again; no line is inferred from the schedule.";
    case "no_quotes_published":
      return "Use the authorized CSV template for a licensed export, or rerun capture when the provider publishes a complete pregame market.";
    case "quotes_failed_validation":
      return "Correct the rejected rows using exact game IDs, participants, and pregame capture/update clocks before importing again.";
    case "capture_incomplete":
      return "Retry the bounded capture after the source responds; use the authorized CSV template only when a complete quote and timing record is available.";
    case "capture_blocked_policy":
      return "Retry after the source robots policy is readable and permissive, or use the authorized CSV template with exact game and pregame clocks.";
    case "validated_quotes":
      return "Open the forecast record to inspect the qualifying model-to-line comparisons.";
    default:
      return "Use the authorized CSV template with exact game IDs and pregame clocks; missing evidence stays unavailable.";
  }
}
