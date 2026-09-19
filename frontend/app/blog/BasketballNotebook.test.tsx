import { describe, expect, it } from "vitest";
import { notebookForecastIdentity } from "./BasketballNotebook";

describe("basketball notebook forecast identity", () => {
  it("preserves the exact model edition and capture clock", () => {
    expect(notebookForecastIdentity("  basketball-efficiency-v2-abc123  ", "2026-09-19T12:00:00Z")).toEqual({
      modelId: "basketball-efficiency-v2-abc123",
      generatedAt: "2026-09-19T12:00:00Z",
    });
  });

  it("fails visibly when publication metadata is missing", () => {
    expect(notebookForecastIdentity("", null)).toEqual({
      modelId: "unavailable",
      generatedAt: "unavailable",
    });
  });
});
