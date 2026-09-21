import { describe, expect, it } from "vitest";
import { summarizeLowerDivisionTargetProbe } from "./lower-division-target-probe";

const receipt = { sha256: "a".repeat(64), url: "https://sdataprod.ncaa.com" };

describe("lower-division target-season probes", () => {
  it("summarizes empty receipt-backed responses without making them schedule rows", () => {
    const summary = summarizeLowerDivisionTargetProbe({
      target_season: "2026-27",
      requested_months: [9, 10, 11],
      generated_at: "2026-09-21T19:26:41.820720Z",
      source: { season_year: 2026 },
      calendar: [],
      contests: [],
      receipts: [receipt, receipt],
    });
    expect(summary).toMatchObject({ season: "2026-27", seasonYear: 2026, months: [9, 10, 11], calendarDays: 0, contests: 0, receipts: 2 });
  });

  it("rejects probes without valid source receipts", () => {
    expect(summarizeLowerDivisionTargetProbe({ source: { season_year: 2026 }, generated_at: "2026-09-21T19:00:00Z", requested_months: [9], calendar: [], contests: [], receipts: [{ sha256: "missing" }] })).toBeNull();
  });
});
