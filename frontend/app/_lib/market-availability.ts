export type MarketCaptureStatus =
  | "no_eligible_summaries"
  | "no_quotes_published"
  | "quotes_failed_validation"
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
    case "validated_quotes":
      return "Open the forecast record to inspect the qualifying model-to-line comparisons.";
    default:
      return "Use the authorized CSV template with exact game IDs and pregame clocks; missing evidence stays unavailable.";
  }
}
