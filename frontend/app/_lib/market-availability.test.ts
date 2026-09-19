import { describe, expect, it } from "vitest";
import { marketCaptureStatusDetail, marketCaptureStatusLabel } from "./market-availability";

describe("market capture availability", () => {
  it("distinguishes an unpriced capture from validation failures", () => {
    expect(marketCaptureStatusLabel("no_quotes_published")).toBe("Captured summaries contained no published quotes");
    expect(marketCaptureStatusDetail("no_quotes_published")).toContain("No line is inferred");
    expect(marketCaptureStatusLabel("quotes_failed_validation")).toContain("failed exact-game");
  });

  it("keeps unknown and missing statuses explicit", () => {
    expect(marketCaptureStatusLabel(undefined)).toBe("Quote availability is not resolved");
    expect(marketCaptureStatusDetail("no_eligible_summaries")).toContain("No upcoming game summary");
  });
});
