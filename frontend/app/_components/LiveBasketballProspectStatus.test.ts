import { describe, expect, it } from "vitest";
import { prospectCoverageSummary } from "./LiveBasketballProspectStatus";

describe("prospect coverage summary", () => {
  it("distinguishes all retained rows from rows with a recorded rank", () => {
    expect(prospectCoverageSummary({ season: 2027, total: 383, ranked: 301, committed: 132 })).toBe(
      "2027 · 383 prospects (301 ranked · 132 committed)",
    );
  });

  it("preserves zero coverage as an explicit value", () => {
    expect(prospectCoverageSummary({ season: 2030, total: 1, ranked: 0, committed: 0 })).toBe(
      "2030 · 1 prospects (0 ranked · 0 committed)",
    );
  });
});
