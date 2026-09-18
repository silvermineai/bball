import { describe, expect, it } from "vitest";
import { validateNcaaCareerExportPage, type NcaaCareerResult } from "./NcaaCareers";

describe("historical player-season export pagination", () => {
  const page = (overrides: Partial<NcaaCareerResult> = {}): NcaaCareerResult => ({
    from_season: 2020,
    to_season: 2026,
    metric: "points",
    min_games: 20,
    min_minutes: 200,
    min_denominator: 0,
    page: 0,
    page_size: 1,
    total: 2,
    rows: [{} as NcaaCareerResult["rows"][number]],
    source_receipts: [],
    ...overrides,
  });

  it("accepts stable career metadata", () => {
    expect(validateNcaaCareerExportPage(page(), 2020, 2026, "points", 20, 200, 0, 2, 1, [], 0, 2)).toHaveLength(1);
  });

  it("rejects changed filters, page, or edition receipts", () => {
    expect(() => validateNcaaCareerExportPage(page({ min_minutes: 400 }), 2020, 2026, "points", 20, 200, 0, 2, 1, [], 0, 2)).toThrow(/changed/);
    expect(() => validateNcaaCareerExportPage(page({ page: 1 }), 2020, 2026, "points", 20, 200, 0, 2, 1, [], 0, 2)).toThrow(/changed/);
    expect(() => validateNcaaCareerExportPage(page({ source_receipts: [{ dataset: "ncaa_player_box", season: 2026, url: "u", fetched_at: "2026-09-18T00:00:00Z", sha256: "x" }] }), 2020, 2026, "points", 20, 200, 0, 2, 1, [], 0, 2)).toThrow(/changed/);
  });

  it("rejects an empty intermediate page", () => {
    expect(() => validateNcaaCareerExportPage(page({ rows: [] }), 2020, 2026, "points", 20, 200, 0, 2, 1, [], 0, 2)).toThrow(/incomplete page/);
  });
});
