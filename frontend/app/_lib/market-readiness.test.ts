import { describe, expect, it } from "vitest";
import { marketCaptureDiagnostic, marketReadinessLabel, marketReadinessState } from "./market-readiness";

describe("market connector readiness", () => {
  it("keeps an unavailable archive fail closed", () => {
    expect(marketReadinessState({ source: "unavailable", research_receipts: 4 })).toBe("unavailable");
    expect(marketReadinessLabel("unavailable")).toBe("Readiness unavailable");
  });

  it("does not call a capture qualified without a receipt and status", () => {
    expect(marketReadinessState({ provider_capabilities: [{}] })).toBe("unverified");
    expect(marketReadinessState({ research_receipts: 1 })).toBe("unverified");
  });

  it("distinguishes a run with no quote from rejected and validated quotes", () => {
    expect(marketReadinessState({ research_receipts: 1, research_capture: { market_status: "no_quotes_published" } })).toBe("captured_no_quotes");
    expect(marketReadinessState({ research_receipts: 1, research_capture: { market_status: "quotes_failed_validation" } })).toBe("captured_rejected");
    expect(marketReadinessState({ research_receipts: 1, research_capture: { market_status: "validated_quotes" } })).toBe("validated");
  });

  it("keeps an in-flight request visibly separate", () => {
    expect(marketReadinessState(null, true)).toBe("checking");
    expect(marketReadinessLabel("checking")).toContain("Checking");
  });

  it("reports capture coverage separately from accepted quotes", () => {
    expect(marketCaptureDiagnostic({
      research_capture: {
        summary_count: 71,
        summary_with_pickcenter: 0,
        summary_with_odds: 0,
        accepted_markets: 0,
        rejected_records: 0,
      },
    })).toBe("Latest capture inspected 71 future summaries; 0 contained complete quote sets and 0 had a non-empty odds payload; 0 markets passed validation; 0 summaries were rejected.");
  });

  it("withholds a capture diagnostic when the receipt has no summary count", () => {
    expect(marketCaptureDiagnostic({ research_receipts: 1 })).toBeNull();
  });
});
