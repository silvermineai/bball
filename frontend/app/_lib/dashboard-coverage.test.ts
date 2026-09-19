import { describe, expect, it } from "vitest";
import type { BBDatasetCoverage } from "./basketball-types";
import { coverageReceiptState, dashboardCoverageRows } from "./dashboard-coverage";

const dataset = (overrides: Partial<BBDatasetCoverage>): BBDatasetCoverage => ({
  key: "player_box",
  label: "Player boxes",
  rows: 100,
  seasons: [2026],
  source_seasons: [2026],
  source_count: 1,
  latest_source_at: "2026-09-18T00:00:00Z",
  source_url: null,
  identity_note: "Exact retained rows",
  ...overrides,
});

describe("dashboardCoverageRows", () => {
  it("shows only positive finite datasets and orders the largest tables first", () => {
    const rows = dashboardCoverageRows([
      dataset({ key: "small", label: "Small", rows: 10 }),
      dataset({ key: "empty", label: "Empty", rows: 0 }),
      dataset({ key: "large", label: "Large", rows: 500 }),
      dataset({ key: "invalid", label: "Invalid", rows: Number.NaN }),
    ]);

    expect(rows.map((row) => row.key)).toEqual(["large", "small"]);
  });
});

describe("coverageReceiptState", () => {
  it("requires both a positive receipt count and a valid timestamp", () => {
    expect(coverageReceiptState(dataset({}))).toBe("recorded");
    expect(coverageReceiptState(dataset({ source_count: 0, latest_source_at: null }))).toBe("missing");
    expect(coverageReceiptState(dataset({ source_count: 3, latest_source_at: null }))).toBe("incomplete");
    expect(coverageReceiptState(dataset({ source_count: 3, latest_source_at: "not-a-date" }))).toBe("incomplete");
    expect(coverageReceiptState(dataset({ source_count: 0, latest_source_at: "2026-09-18T00:00:00Z" }))).toBe("incomplete");
  });
});
