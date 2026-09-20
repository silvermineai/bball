import type { MarketCaptureStatus } from "./market-availability";

export type MarketReadinessMetadata = {
  source?: "partial" | "unavailable";
  research_receipts?: number;
  provider_capabilities?: unknown[];
  research_capture?: {
    market_status?: MarketCaptureStatus;
  };
};

export type MarketReadinessState =
  | "checking"
  | "unavailable"
  | "unverified"
  | "captured_no_quotes"
  | "captured_rejected"
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
    case "validated": return "Validated quote capture available";
  }
}
