import { describe, expect, it } from "vitest";
import { prospectArchiveSummary, prospectCoverageSummary, prospectReceiptSummary } from "./LiveBasketballProspectStatus";

describe("prospect coverage summary", () => {
  it("reconciles national prospect rows across unique tracked classes", () => {
    expect(prospectArchiveSummary([
      { season: 2027, total: 10, ranked: 8, committed: 4, graded: 7, captured_at: null },
      { season: 2028, total: 12, ranked: 9, committed: 5, graded: 8, captured_at: null },
      { season: 2027, total: 99, ranked: 99, committed: 99, graded: 99, captured_at: null },
    ])).toEqual({ classes: 2, total: 22, ranked: 17, committed: 9 });
  });

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

  it("reports release receipt integrity separately from prospect counts", () => {
    expect(prospectReceiptSummary([
      { source_receipt: { source_rows: 383, integrity: "verified" } },
      { source_receipt: { source_rows: 383, integrity: "verified" } },
    ])).toBe("2 of 2 release receipts verified · 766 retained rows");
    expect(prospectReceiptSummary([
      { source_receipt: { source_rows: 383, integrity: "verified" } },
      { source_receipt: null },
    ])).toBe("1 of 2 release receipts verified · 1 unavailable · 383 retained rows");
  });

  it("does not turn missing receipt rows into a zero", () => {
    expect(prospectReceiptSummary([{ source_receipt: null }])).toBe("0 of 1 release receipts verified · 1 unavailable");
    expect(prospectReceiptSummary([])).toBe("No release receipt available");
  });
});
