import { describe, expect, it } from "vitest";
import { scopedWomensSchedule, upcomingWomensSchedule } from "./WomensLowerDivisionScheduleReadiness";

const asset = {
  contests: [
    { division: 2, contest_id: 2, contest_date: "11/02/2026", teams: [{ home: true, name: "Home" }, { home: false, name: "Away" }] },
    { division: 3, contest_id: 3, contest_date: "11/03/2026", teams: [{ home: true, name: "D3 Home" }, { home: false, name: "D3 Away" }] },
    { division: 2, contest_id: 1, contest_date: "10/31/2026", teams: [{ home: true, name: "Earlier Home" }, { home: false, name: "Earlier Away" }] },
  ],
};

describe("women lower division schedule readiness", () => {
  it("keeps exact division rows and deterministic date order", () => {
    expect(scopedWomensSchedule(asset, "2").map((row) => row.contest_id)).toEqual([1, 2]);
    expect(scopedWomensSchedule(asset, "3").map((row) => row.contest_id)).toEqual([3]);
  });

  it("only labels retained rows as upcoming when their date is current or later", () => {
    const now = Date.parse("2026-11-01T00:00:00Z");
    expect(upcomingWomensSchedule(asset, "2", now).map((row) => row.contest_id)).toEqual([2]);
  });
});

