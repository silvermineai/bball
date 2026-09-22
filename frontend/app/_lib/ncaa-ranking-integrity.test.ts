import { describe, expect, it } from "vitest";
import { validateRankingCohort } from "./ncaa-ranking-integrity";

describe("NCAA ranking cohort integrity", () => {
  it("accepts a bounded ranked page and an empty qualified cohort", () => {
    expect(validateRankingCohort(2, [{ rank: 1 }, { rank: 2 }])).toEqual({ ok: true, total: 2 });
    expect(validateRankingCohort(0, [])).toEqual({ ok: true, total: 0 });
  });

  it.each([
    ["a negative total", -1, [{ rank: 1 }]],
    ["a fractional total", 2.5, [{ rank: 1 }]],
    ["a missing total", null, [{ rank: 1 }]],
    ["a rank above the cohort", 2, [{ rank: 3 }]],
    ["a missing rank", 2, [{}]],
    ["more rows than the cohort", 1, [{ rank: 1 }, { rank: 2 }]],
  ])("rejects %s", (_label, total, rows) => {
    expect(validateRankingCohort(total, rows)).toMatchObject({ ok: false });
  });
});
