import { describe, expect, it } from "vitest";
import { fieldAvailability, validatePlayerBoxExportPage, type PlayerBoxResult } from "./NcaaPlayerBox";

describe("player box export pagination", () => {
  const page = (overrides: Partial<PlayerBoxResult> = {}): PlayerBoxResult => ({
    season: 2026,
    archive_mode: "games",
    field_filter: null,
    page: 0,
    page_size: 1,
    total: 2,
    rows: [{} as PlayerBoxResult["rows"][number]],
    ...overrides,
  });

  it("accepts stable season and archive metadata", () => {
    expect(validatePlayerBoxExportPage(page(), "2026", "games", null, 2, 1, 0, 2)).toHaveLength(1);
  });

  it("rejects a changed archive or page", () => {
    expect(() => validatePlayerBoxExportPage(page({ archive_mode: "season" }), "2026", "games", null, 2, 1, 0, 2)).toThrow(/changed/);
    expect(() => validatePlayerBoxExportPage(page({ page: 1 }), "2026", "games", null, 2, 1, 0, 2)).toThrow(/changed/);
    expect(() => validatePlayerBoxExportPage(page({ field_filter: "rim_pct" }), "2026", "games", null, 2, 1, 0, 2)).toThrow(/changed/);
  });

  it("rejects an empty intermediate page", () => {
    expect(() => validatePlayerBoxExportPage(page({ rows: [] }), "2026", "games", null, 2, 1, 0, 2)).toThrow(/incomplete page/);
  });
});

describe("player box field availability", () => {
  it("distinguishes complete, partial, and unavailable field coverage", () => {
    expect(fieldAvailability(100, 100)).toBe("complete");
    expect(fieldAvailability(100, 72)).toBe("partial");
    expect(fieldAvailability(100, 0)).toBe("unavailable");
  });

  it("fails closed for incoherent coverage counts", () => {
    expect(fieldAvailability(0, 0)).toBe("unavailable");
    expect(fieldAvailability(100, 101)).toBe("unavailable");
    expect(fieldAvailability(100, 1.5)).toBe("unavailable");
  });
});
