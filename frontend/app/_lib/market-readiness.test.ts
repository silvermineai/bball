import { describe, expect, it } from "vitest";
import { formatMarketComparisonReadiness, marketCaptureCoverage, marketCaptureCoverageDetail, marketCaptureDiagnostic, marketCaptureHistoryDiagnostic, marketReadinessDetail, marketReadinessLabel, marketReadinessScorecardNote, marketReadinessState, marketSourceAccess, marketSourceAccessLabel, modelScopedScorecardPath } from "./market-readiness";

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
    expect(marketReadinessState({ research_receipts: 1, research_capture: { market_status: "capture_incomplete" } })).toBe("captured_incomplete");
    expect(marketReadinessState({ research_receipts: 1, research_capture: { market_status: "capture_blocked_policy" } })).toBe("capture_blocked");
  });

  it("keeps an in-flight request visibly separate", () => {
    expect(marketReadinessState(null, true)).toBe("checking");
    expect(marketReadinessLabel("checking")).toContain("Checking");
    expect(marketReadinessDetail(null, true)).toContain("Waiting");
  });

  it("explains missing and rejected evidence without inventing a line", () => {
    expect(marketReadinessDetail({ provider_capabilities: [{}] })).toContain("No capture receipt");
    expect(marketReadinessDetail({ research_receipts: 1, research_capture: { market_status: "no_quotes_published" } })).toContain("No line is inferred");
    expect(marketReadinessDetail({ research_receipts: 1, research_capture: { market_status: "quotes_failed_validation" } })).toContain("failed exact-game");
    expect(marketReadinessDetail({ research_receipts: 1, research_capture: { market_status: "capture_incomplete" } })).toContain("could not be read");
    expect(marketReadinessDetail({ research_receipts: 1, research_capture: { market_status: "capture_blocked_policy" } })).toContain("no summary request was made");
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

  it("gives the upcoming slate a safe no-quote readiness message", () => {
    const metadata = {
      research_receipts: 45,
      research_capture: {
        summary_count: 120,
        eligible_games: 120,
        summary_with_pickcenter: 0,
        summary_with_odds: 0,
        accepted_markets: 0,
        rejected_records: 0,
        market_status: "no_quotes_published" as const,
      },
    };
    expect(marketReadinessLabel(marketReadinessState(metadata))).toBe("Capture ran · no quote qualified");
    expect(marketCaptureDiagnostic(metadata)).toContain("120 future summaries of 120 eligible games");
    expect(marketReadinessDetail(metadata)).toContain("No line is inferred");
  });

  it("withholds a capture diagnostic when the receipt has no summary count", () => {
    expect(marketCaptureDiagnostic({ research_receipts: 1 })).toBeNull();
  });

  it("distinguishes repeated no-quote captures from incomplete connector runs", () => {
    expect(marketCaptureHistoryDiagnostic({
      research_capture_summary: {
        attempts: 20,
        captures_with_quotes: 0,
        captures_with_validated_markets: 0,
        captures_incomplete: 1,
      },
    })).toBe("Capture history: 20 attempts, 0 with published quotes, 0 with validated markets, 1 incomplete.");
    expect(marketCaptureHistoryDiagnostic({
      research_capture_summary: { attempts: 2, captures_with_quotes: 1, captures_with_validated_markets: 2 },
    })).toBeNull();
    expect(marketCaptureHistoryDiagnostic({})).toBeNull();
  });

  it("shows unreadable eligible games in the capture diagnostic", () => {
    expect(marketCaptureDiagnostic({
      research_capture: {
        summary_count: 0,
        eligible_games: 12,
        summary_fetch_failures: 12,
        summary_with_pickcenter: 0,
      },
    })).toContain("0 future summaries of 12 eligible games; 0 contained complete quote sets; 12 summary requests failed");
  });

  it("gives the scorecard a distinct incomplete-capture instruction", () => {
    expect(marketReadinessScorecardNote("captured_incomplete")).toContain("could not be read");
    expect(marketReadinessScorecardNote("captured_incomplete")).toContain("Retry");
    expect(marketReadinessScorecardNote("captured_incomplete")).toContain("no line or model edge");
  });

  it("explains the retained-to-comparison funnel", () => {
    expect(formatMarketComparisonReadiness({
      retained_observations: 12,
      selected_game_observations: 9,
      outside_selected_cohort: 3,
      eligible_observations: 7,
      comparable_observations: 6,
      superseded_observations: 2,
      selected_comparisons: 4,
      rejection_counts: {},
    })).toBe("Comparison funnel: 9 of 12 retained quote rows matched the selected forecast cohort (3 outside it); 7 passed pregame, participant and freshness checks; 6 passed model and line validation; 4 remain after provider, bookmaker and market selection (2 superseded).");
  });

  it("fails closed for inconsistent comparison counts", () => {
    expect(formatMarketComparisonReadiness({
      retained_observations: 2,
      selected_game_observations: 3,
      outside_selected_cohort: 0,
      eligible_observations: 3,
      comparable_observations: 3,
      superseded_observations: 0,
      selected_comparisons: 3,
      rejection_counts: {},
    })).toBe("");
    expect(formatMarketComparisonReadiness(undefined)).toBe("");
  });

  it("surfaces the dominant rejection reason when no quote can qualify", () => {
    expect(formatMarketComparisonReadiness({
      retained_observations: 1447,
      selected_game_observations: 675,
      outside_selected_cohort: 772,
      eligible_observations: 0,
      comparable_observations: 0,
      superseded_observations: 0,
      selected_comparisons: 0,
      rejection_counts: { captured_before_registration: 675 },
    })).toContain("Rejection detail: 675 Captured before forecast registration.");
  });

  it("pins the scorecard to the active forecast edition", () => {
    expect(modelScopedScorecardPath("football", " ridge-team-v2 ")).toBe("/api/research/scorecard?sport=football&model=ridge-team-v2&limit=1");
    expect(modelScopedScorecardPath("basketball", "edition/unsafe")).toBe("/api/research/scorecard?sport=basketball&model=edition%2Funsafe&limit=1");
    expect(modelScopedScorecardPath("basketball", "edition", 5000)).toBe("/api/research/scorecard?sport=basketball&model=edition&limit=5000");
    expect(modelScopedScorecardPath("basketball", "edition", 0)).toBe("/api/research/scorecard?sport=basketball&model=edition&limit=1");
    expect(modelScopedScorecardPath("football", " ")).toBeNull();
  });

  it("keeps public, licensed, and authorized feed provenance distinct", () => {
    const metadata = {
      provider_capabilities: [
        { source_access: "authorized" },
        { source_access: "public" },
        { source_access: "licensed" },
        { source_access: "unverified" },
      ],
    };
    expect(marketSourceAccess(metadata)).toEqual(["public", "licensed", "authorized"]);
    expect(marketSourceAccessLabel(metadata)).toBe("public · licensed · authorized");
    expect(marketSourceAccessLabel({ provider_capabilities: [{}] })).toBe("Not reported");
  });

  it("reports when a capture is deliberately bounded below the eligible slate", () => {
    expect(marketCaptureDiagnostic({
      research_capture: {
        summary_count: 120,
        eligible_games: 120,
        candidate_games: 1629,
        capture_limit: 120,
        capture_truncated: true,
        summary_with_pickcenter: 0,
        summary_with_odds: 0,
        accepted_markets: 0,
        rejected_records: 0,
      },
    })).toContain("120 of 1,629 eligible games (limit 120)");
  });

  it("separates returned summaries, failed reads, and an intentionally bounded slate", () => {
    const metadata = {
      research_capture: {
        summary_count: 299,
        eligible_games: 300,
        candidate_games: 559,
        capture_truncated: true,
        summary_fetch_failures: 1,
      },
    };
    expect(marketCaptureCoverage(metadata)).toMatchObject({
      returned: 299,
      failed: 1,
      requested: 300,
      candidates: 559,
      returnedRate: 299 / 300,
      selectedRate: 300 / 559,
      bounded: true,
    });
    expect(marketCaptureCoverageDetail(metadata)).toBe(
      "Source responses: 299 of 300 selected (99.7%); 1 selected requests failed. Selection sampled 300 of 559 available candidates (53.7%); the remainder was not requested.",
    );
  });

  it("does not invent a coverage ratio when counters contradict", () => {
    const metadata = { research_capture: { summary_count: 12, eligible_games: 10 } };
    expect(marketCaptureCoverage(metadata).returnedRate).toBeNull();
    expect(marketCaptureCoverageDetail(metadata)).toBe("Source responses: 12 of 10 selected; 0 selected requests failed.");
  });

});
