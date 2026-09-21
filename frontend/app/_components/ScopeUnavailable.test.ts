import { describe, expect, it } from "vitest";
import { scopeFallbackArchiveHref } from "./ScopeUnavailable";

describe("scope unavailable fallback actions", () => {
  it("does not reset lower-division football to the D1 source archive", () => {
    expect(scopeFallbackArchiveHref("football", false, false, null, "2")).toBeNull();
    expect(scopeFallbackArchiveHref("football", false, false, null, "3")).toBeNull();
  });

  it("keeps published basketball archive actions scoped", () => {
    expect(scopeFallbackArchiveHref("basketball", false, false, "2", null)).toBe("/basketball/ncaa/?division=2");
    expect(scopeFallbackArchiveHref("basketball", true, true, null, null)).toBe("/basketball/?gender=women&division=1");
  });

  it("retains the D1 football fallback only for the D1 scope", () => {
    expect(scopeFallbackArchiveHref("football", false, false, null, null)).toBe("/football/source-stats/");
  });
});
