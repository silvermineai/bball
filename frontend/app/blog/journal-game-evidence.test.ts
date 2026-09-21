import { describe, expect, it } from "vitest";
import { journalScheduleEvidence } from "./journal-game-evidence";

describe("upcoming journal schedule evidence", () => {
  it("recognizes a recorded source-confirmed start", () => {
    expect(journalScheduleEvidence({
      time_tbd: 0,
      source_start: "2026-11-02T05:00:00Z",
      source_time_valid: true,
    })).toMatchObject({ label: "Source-confirmed start", confirmed: true });
  });

  it("keeps TBD and unresolved clocks separate from a confirmed start", () => {
    expect(journalScheduleEvidence({ time_tbd: 1, source_start: null, source_time_valid: false })).toMatchObject({
      label: "Start time unconfirmed",
      confirmed: false,
    });
    expect(journalScheduleEvidence({ time_tbd: 0, source_start: null, source_time_valid: false })).toMatchObject({
      label: "Source clock unresolved",
      confirmed: false,
    });
  });
});
