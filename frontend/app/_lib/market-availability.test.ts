import { describe, expect, it } from "vitest";
import { marketCaptureNextStep, marketCaptureStatusDetail, marketCaptureStatusLabel } from "./market-availability";

describe("market capture availability", () => {
  it("distinguishes an unpriced capture from validation failures", () => {
    expect(marketCaptureStatusLabel("no_quotes_published")).toBe("Captured summaries contained no published quotes");
    expect(marketCaptureStatusDetail("no_quotes_published")).toContain("No line is inferred");
    expect(marketCaptureStatusLabel("quotes_failed_validation")).toContain("failed exact-game");
    expect(marketCaptureStatusLabel("capture_incomplete")).toContain("incomplete");
    expect(marketCaptureStatusDetail("capture_incomplete")).toContain("could not be read");
  });

  it("keeps unknown and missing statuses explicit", () => {
    expect(marketCaptureStatusLabel(undefined)).toBe("Quote availability is not resolved");
    expect(marketCaptureStatusDetail("no_eligible_summaries")).toContain("No upcoming game summary");
  });

  it("gives an empty capture a lawful next step without inventing a quote", () => {
    expect(marketCaptureNextStep("no_quotes_published")).toContain("authorized CSV template");
    expect(marketCaptureNextStep("quotes_failed_validation")).toContain("exact game IDs");
    expect(marketCaptureNextStep("capture_incomplete")).toContain("Retry");
    expect(marketCaptureNextStep(undefined)).toContain("missing evidence stays unavailable");
  });
});
