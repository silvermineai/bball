import { describe, expect, it } from "vitest";
import { auditSourceClocks, summarizePossessionReadiness } from "./coverage-health";

describe("source clock audit", () => {
  it("keeps stale and missing datasets visible when another receipt is fresh", () => {
    const now = Date.parse("2026-09-09T12:00:00Z");
    expect(
      auditSourceClocks(
        [
          { dataset: "schedule", source_count: 2, latest_source_at: "2026-09-09T11:00:00Z" },
          { dataset: "player_box", source_count: 2, latest_source_at: "2026-09-01T11:00:00Z" },
          { dataset: "rosters", source_count: 0, latest_source_at: null },
        ],
        now,
      ),
    ).toEqual({
      latestAt: "2026-09-09T11:00:00Z",
      stale: ["player_box"],
      missing: ["rosters"],
    });
  });

  it("does not mark a clock at the threshold as stale", () => {
    const now = Date.parse("2026-09-09T12:00:00Z");
    expect(
      auditSourceClocks(
        [{ dataset: "schedule", source_count: 1, latest_source_at: "2026-09-02T12:00:00Z" }],
        now,
      ),
    ).toEqual({ latestAt: "2026-09-02T12:00:00Z", stale: [], missing: [] });
  });
});

describe("possession readiness summary", () => {
  it("keeps the usable denominator and review flags explicit", () => {
    expect(
      summarizePossessionReadiness({
        total: 100,
        valid_estimate_games: 94,
        missing_box_games: 4,
        missing_team_box_rows: 2,
        score_mismatch_games: 1,
      }),
    ).toEqual({
      total: 100,
      usable: 94,
      withheld: 6,
      usableShare: 0.94,
      reviewFlags: 7,
    });
  });

  it("does not allow malformed counts to create a negative denominator", () => {
    expect(
      summarizePossessionReadiness({ total: 0, valid_estimate_games: 4 }),
    ).toEqual({
      total: 0,
      usable: 0,
      withheld: 0,
      usableShare: null,
      reviewFlags: 0,
    });
  });
});
