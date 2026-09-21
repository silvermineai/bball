import { describe, expect, it } from "vitest";
import { rotationWatchNumber, rotationWatchPlayerHref, rotationWatchRows, rotationWatchStatus } from "./rotation-watch";
import type { BBRosterPlayerWatch } from "./basketball-types";

const player = (overrides: Partial<BBRosterPlayerWatch> = {}): BBRosterPlayerWatch => ({
  athlete_id: "123",
  name: "A. Player",
  prior_minutes: 812.5,
  bpm: 3.2,
  returning: true,
  represented: true,
  weighted_bpm_minutes: 2600,
  ...overrides,
});

describe("rotation watch", () => {
  it("keeps the publisher order and bounds the watch list at five", () => {
    const players = Array.from({ length: 6 }, (_, index) => player({ athlete_id: String(index) }));
    expect(rotationWatchRows(players).map((row) => row.athlete_id)).toEqual(["0", "1", "2", "3", "4"]);
    expect(rotationWatchRows(undefined)).toEqual([]);
  });

  it("keeps each exact-ID continuity state distinct", () => {
    expect(rotationWatchStatus(player())).toBe("Returning · exact roster match");
    expect(rotationWatchStatus(player({ returning: true, represented: false }))).toBe("Returning · crosswalk incomplete");
    expect(rotationWatchStatus(player({ returning: false, represented: true }))).toBe("Observed at another program");
    expect(rotationWatchStatus(player({ returning: false, represented: false }))).toBe("No current roster match");
    expect(rotationWatchStatus({ returning: undefined as never, represented: undefined as never })).toBe("Continuity unavailable");
  });

  it("preserves unavailable numeric values and links by exact player ID", () => {
    expect(rotationWatchNumber(null)).toBe("—");
    expect(rotationWatchNumber(Number.NaN)).toBe("—");
    expect(rotationWatchNumber(3.25, 2)).toBe("3.25");
    expect(rotationWatchPlayerHref("a/b", 2026)).toBe("/basketball/ncaa-player/?id=a%2Fb&season=2026");
  });
});
