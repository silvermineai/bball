import { describe, expect, it } from "vitest";
import {
  currentRecruitingBoardResult,
  recruitingBoardRequestSearch,
  recruitingExportCsv,
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
