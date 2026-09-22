import { describe, expect, it } from "vitest";
import { recruitingProductionCoverage } from "./recruiting-production-coverage";
import type { RecruitingProductionIndex } from "./recruiting-production-index";

const index: RecruitingProductionIndex = {
  season: 2027,
  edition: "a".repeat(64),
  reviewedAt: "2026-09-16T00:00:00Z",
  sourceRows: 2,
  linkedRows: 1,
  byAthleteId: new Map([[
    "42",
    {
      id: "42", team_id: "7", team: "Example", season: 2026, games: 20, mpg: 12,
      ppg: 4, rpg: 2, apg: 1, spg: 1, bpg: 0, topg: 1, efg: 0.5, ts: 0.52,
      three_pct: null, ft_pct: 0.7, ft_rate: 0.2, three_rate: 0.3, tov_rate: 0.1,
      incomplete_box_games: 0, identity_basis: "exact source ID",
    },
  ]]),
};

describe("recruiting production coverage", () => {
  it("reports exact links and the page denominator without treating missing as zero production", () => {
    expect(recruitingProductionCoverage([{ athlete_id: "42" }, { athlete_id: "99" }], index)).toEqual({
      totalRows: 2,
      linkedRows: 1,
      unavailableRows: 1,
      linkedShare: 0.5,
    });
  });

  it("withholds the summary for missing indexes, duplicate IDs, or malformed IDs", () => {
    expect(recruitingProductionCoverage([{ athlete_id: "42" }], null)).toBeNull();
    expect(recruitingProductionCoverage([{ athlete_id: "42" }, { athlete_id: "42" }], index)).toBeNull();
    expect(recruitingProductionCoverage([{ athlete_id: "not-an-id" }], index)).toBeNull();
  });

  it("keeps an empty valid page denominator explicit", () => {
    expect(recruitingProductionCoverage([], index)).toEqual({
      totalRows: 0,
      linkedRows: 0,
      unavailableRows: 0,
      linkedShare: null,
    });
  });
});
