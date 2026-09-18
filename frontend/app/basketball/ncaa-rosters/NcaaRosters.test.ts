import { describe, expect, it } from "vitest";
import { validateNcaaRosterExportPage, type NcaaRosterResult } from "./NcaaRosters";

describe("roster export pagination", () => {
  const page = (overrides: Partial<NcaaRosterResult> = {}): NcaaRosterResult => ({
    season: 2026,
    page: 0,
    page_size: 1,
    total: 2,
    rows: [{} as NcaaRosterResult["rows"][number]],
    ...overrides,
  });

  it("accepts stable roster metadata", () => {
    expect(validateNcaaRosterExportPage(page(), 2026, 2, 1, 0, 2)).toHaveLength(1);
  });

  it("rejects changed season, page, or total metadata", () => {
    expect(() => validateNcaaRosterExportPage(page({ season: 2025 }), 2026, 2, 1, 0, 2)).toThrow(/changed/);
    expect(() => validateNcaaRosterExportPage(page({ page: 1 }), 2026, 2, 1, 0, 2)).toThrow(/changed/);
    expect(() => validateNcaaRosterExportPage(page({ total: 3 }), 2026, 2, 1, 0, 2)).toThrow(/changed/);
  });

  it("rejects an empty intermediate page", () => {
    expect(() => validateNcaaRosterExportPage(page({ rows: [] }), 2026, 2, 1, 0, 2)).toThrow(/incomplete page/);
  });
});
