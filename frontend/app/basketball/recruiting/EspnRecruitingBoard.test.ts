import { describe, expect, it } from "vitest";
import { validateRecruitingExportPage, type RecruitingBoardResult } from "./EspnRecruitingBoard";

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
