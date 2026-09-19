import { describe, expect, it } from "vitest";
import { prospectClassContext } from "./class-context";

describe("prospectClassContext", () => {
  it("keeps the exact rank beside valid unfiltered class denominators", () => {
    expect(prospectClassContext({ total: 383, committed: 132, ranked: 301, graded: 302 }, 36)).toEqual({
      total: 383,
      committed: 132,
      ranked: 301,
      graded: 302,
      nationalRank: 36,
      rankCoverage: 301 / 383,
      gradeCoverage: 302 / 383,
      commitmentRate: 132 / 383,
    });
  });

  it("fails closed on impossible denominators and withholds invalid ranks", () => {
    expect(prospectClassContext({ total: 10, committed: 11, ranked: 8, graded: 9 }, 2)).toBeNull();
    expect(prospectClassContext({ total: 10, committed: 2, ranked: 8, graded: 9 }, 0)?.nationalRank).toBeNull();
    expect(prospectClassContext({ total: 10, committed: 2, ranked: 8, graded: 9 }, 9)?.nationalRank).toBeNull();
    expect(prospectClassContext({ total: 10, committed: 2, ranked: 8, graded: 9 }, 11)?.nationalRank).toBeNull();
    expect(prospectClassContext(undefined, 2)).toBeNull();
  });
});
