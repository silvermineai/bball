import { describe, expect, it } from "vitest";
import {
  classDestinationRows,
  classSnapshotCoverage,
  currentRecruitingBoardResult,
  recruitingBoardRequestSearch,
  recruitingExportCsv,
  validRecruitingRankDistribution,
  validateRecruitingExportPage,
  type RecruitingBoardResult,
} from "./RecruitingBoard";

describe("recruiting board export pagination", () => {
  const row = {
    athlete_id: "42",
    name: "Guard",
    position: "PG",
    grade: 95,
    rank: 1,
    position_rank: 1,
    state_rank: 1,
    region_rank: 1,
    status: "available",
    committed_team_id: null,
    committed_team_name: null,
    high_school: "Central High",
    hometown: "Springfield",
    height_inches: 72,
    weight_pounds: 180,
    source_url: "",
  };
  const page = (overrides: Partial<RecruitingBoardResult> = {}): RecruitingBoardResult => ({
    season: 2027,
    page: 0,
    page_size: 1,
    total: 2,
    edition: "edition-1",
    captured_at: "2026-09-18T00:00:00Z",
    rows: [row],
    ...overrides,
  });

  it("accepts stable edition metadata", () => {
    expect(validateRecruitingExportPage(page(), 2027, 2, 1, "edition-1", 0, 2)).toEqual([row]);
  });

  it("rejects an edition change and an empty intermediate page", () => {
    expect(() => validateRecruitingExportPage(page({ edition: "edition-2" }), 2027, 2, 1, "edition-1", 0, 2)).toThrow(/changed/);
    expect(() => validateRecruitingExportPage(page({ rows: [] }), 2027, 2, 1, "edition-1", 0, 2)).toThrow(/incomplete page/);
  });

  it("rejects mismatched page metadata", () => {
    expect(() => validateRecruitingExportPage(page({ page: 1 }), 2027, 2, 1, "edition-1", 0, 2)).toThrow(/changed/);
    expect(() => validateRecruitingExportPage(page({ page_size: 2 }), 2027, 2, 1, "edition-1", 0, 2)).toThrow(/changed/);
  });
});

describe("recruiting rank landscape", () => {
  const bands = [
    { key: "top_10" as const, label: "Top 10", min_rank: 1, max_rank: 10, total: 1 },
    { key: "ranks_11_25" as const, label: "11–25", min_rank: 11, max_rank: 25, total: 1 },
    { key: "ranks_26_50" as const, label: "26–50", min_rank: 26, max_rank: 50, total: 1 },
    { key: "ranks_51_100" as const, label: "51–100", min_rank: 51, max_rank: 100, total: 1 },
    { key: "ranks_101_plus" as const, label: "101+", min_rank: 101, max_rank: null, total: 1 },
    { key: "unranked" as const, label: "Rank unavailable", min_rank: null, max_rank: null, total: 1 },
  ];

  it("accepts a complete distribution tied to the active edition denominator", () => {
    const result = {
      season: 2027,
      page: 0,
      page_size: 50,
      total: 6,
      edition: "edition-1",
      captured_at: "2026-09-18T00:00:00Z",
      rows: [],
      rank_distribution: bands,
    } satisfies RecruitingBoardResult;
    expect(validRecruitingRankDistribution(result)).toEqual(bands);
  });

  it("withholds malformed or non-reconciling distributions", () => {
    const base = {
      season: 2027,
      page: 0,
      page_size: 50,
      total: 6,
      edition: "edition-1",
      captured_at: "2026-09-18T00:00:00Z",
      rows: [],
      rank_distribution: bands,
    } satisfies RecruitingBoardResult;
    expect(validRecruitingRankDistribution({ ...base, total: 5 })).toBeNull();
    expect(validRecruitingRankDistribution({ ...base, edition: null })).toBeNull();
    expect(validRecruitingRankDistribution({ ...base, rank_distribution: bands.slice(0, 5) })).toBeNull();
    expect(validRecruitingRankDistribution({ ...base, rank_distribution: bands.map((band, index) => index === 0 ? { ...band, total: -1 } : band) })).toBeNull();
  });
});

describe("recruiting class coverage", () => {
  it("keeps coverage percentages bound to a valid class denominator", () => {
    const snapshot = {
      season: "2027",
      total: 100,
      cohort: { ranked: 80, graded: 75, committed: 40 },
      captured_at: "2026-09-18T00:00:00Z",
      position_breakdown: [],
      commitment_destinations: [],
    };
    expect(classSnapshotCoverage(snapshot)).toEqual({ total: 100, ranked: 0.8, graded: 0.75, committed: 0.4 });
    expect(classSnapshotCoverage({ ...snapshot, total: 0 })).toEqual({ total: null, ranked: null, graded: null, committed: null });
    expect(classSnapshotCoverage({ ...snapshot, cohort: { ranked: 101, graded: 75, committed: 40 } })).toEqual({ total: 100, ranked: null, graded: 0.75, committed: 0.4 });
  });
});

describe("recruiting destination comparison", () => {
  it("keeps destination rows within the committed denominator and preserves position mix", () => {
    const rows = classDestinationRows([{
      season: "2027",
      total: 100,
      cohort: { ranked: 80, graded: 75, committed: 40 },
      captured_at: "2026-09-18T00:00:00Z",
      position_breakdown: [],
      commitment_destinations: [
        {
          team_id: "7",
          team: "North State",
          total: 12,
          ranked_total: 10,
          top100_total: 4,
          source_rank_points: 300,
          best_rank: 8,
          average_rank: 42.5,
          position_breakdown: [{ position: "PG", total: 7 }, { position: "C", total: 5 }],
        },
        {
          team_id: "8",
          team: "Impossible State",
          total: 41,
          ranked_total: 40,
          top100_total: 20,
          source_rank_points: 900,
          best_rank: 1,
          average_rank: 10,
          position_breakdown: [],
        },
      ],
    }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ season: "2027", team_id: "7", committedTotal: 40, positionLabels: ["PG 7", "C 5"] });
  });
});

describe("recruiting board request integrity", () => {
  const request = (overrides: Partial<Parameters<typeof recruitingBoardRequestSearch>[0]> = {}) =>
    recruitingBoardRequestSearch({
      season: "2027",
      page: 0,
      committed: "all",
      movement: "all",
      query: "",
      position: "",
      rankMax: "",
      ...overrides,
    });

  it("keeps a loaded response bound to its exact class and filters", () => {
    const loaded = {
      request: request(),
      result: {
        season: 2027,
        page: 0,
        page_size: 50,
        total: 1,
        edition: "edition-1",
        captured_at: "2026-09-18T00:00:00Z",
        rows: [],
      },
    };

    expect(currentRecruitingBoardResult(loaded, request())).toBe(loaded.result);
    expect(currentRecruitingBoardResult(loaded, request({ season: "2026" }))).toBeNull();
    expect(currentRecruitingBoardResult(loaded, request({ query: "guard" }))).toBeNull();
    expect(currentRecruitingBoardResult(loaded, request({ movement: "up" }))).toBeNull();
  });

  it("normalizes the query before creating the request identity", () => {
    expect(request({ query: "  point guard  " })).toBe(request({ query: "point guard" }));
  });
});

describe("recruiting board complete export", () => {
  const row = {
    athlete_id: "42",
    name: "Guard, Jr.",
    position: "PG",
    grade: 95,
    rank: 1,
    position_rank: 1,
    state_rank: 2,
    region_rank: 3,
    status: "available",
    committed_team_id: "7",
    committed_team_name: "North, State",
    high_school: "Central High",
    hometown: "Springfield",
    height_inches: 72,
    weight_pounds: 180,
    source_url: "",
    school_ids: ["7", "8"],
    previous_rank: 4,
    previous_captured_at: "2026-09-01T00:00:00Z",
  };
  const programs = [
    { id: "7", name: "North State", shortName: "North, State" },
    { id: "8", name: "South State" },
  ];

  it("creates a complete, edition-labeled CSV with recorded school lists", () => {
    const csv = recruitingExportCsv([row], {
      season: "2027",
      edition: "edition-1",
      capturedAt: "2026-09-18T00:00:00Z",
      programs,
    });

    expect(csv).toContain("source_edition");
    expect(csv).toContain("2027,1,4,3");
    expect(csv).toContain('"Guard, Jr."');
    expect(csv).toContain('"North, State; South State"');
    expect(csv).toContain("edition-1");
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("fails closed on duplicate or malformed prospect identities", () => {
    expect(() => recruitingExportCsv([row, row], {
      season: 2027,
      edition: "edition-1",
      capturedAt: null,
      programs,
    })).toThrow(/duplicate or invalid prospect IDs/);
    expect(() => recruitingExportCsv([{ ...row, athlete_id: "unknown" }], {
      season: 2027,
      edition: "edition-1",
      capturedAt: null,
      programs,
    })).toThrow(/duplicate or invalid prospect IDs/);
  });
});
