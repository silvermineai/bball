import { describe, expect, it } from "vitest";
import { auditSourceClocks } from "./coverage-health";

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
