import { describe, expect, it } from "vitest";
import { parseRecruitingRosterBridge } from "./recruiting-roster-bridge";

const digest = "a".repeat(64);
const bridge = {
  athlete_id: "123",
  roster_rows: [{ season: 2027, team_id: "1", team: "Example", name: "Prospect", position: "G", class_year: "Sophomore" }],
  participation_rows: [{ season: 2026, team_id: "1", name: "Prospect", games: 28, minutes: 512.5 }],
  receipts: [
    { dataset: "rosters", season: 2027, fetched_at: "2026-09-19T00:00:00Z", sha256: digest },
    { dataset: "player_box", season: 2026, fetched_at: "2026-09-18T00:00:00Z", sha256: digest },
  ],
  integrity: "verified",
  note: "Exact ID only.",
};

describe("recruiting roster bridge", () => {
  it("accepts source-receipted exact-ID roster and participation rows", () => {
    expect(parseRecruitingRosterBridge(bridge, "123")).toEqual(bridge);
  });

  it("rejects a bridge for another athlete", () => {
    expect(parseRecruitingRosterBridge(bridge, "124")).toBeNull();
  });

  it("rejects duplicate source rows instead of changing the denominator", () => {
    expect(parseRecruitingRosterBridge({
      ...bridge,
      roster_rows: [...bridge.roster_rows, ...bridge.roster_rows],
    }, "123")).toBeNull();
  });

  it("rejects verified observations without a receipt for every observed season", () => {
    expect(parseRecruitingRosterBridge({
      ...bridge,
      receipts: [bridge.receipts[0]],
    }, "123")).toBeNull();
  });

  it("keeps an unavailable empty bridge explicit", () => {
    expect(parseRecruitingRosterBridge({
      ...bridge,
      roster_rows: [],
      participation_rows: [],
      receipts: [],
      integrity: "unavailable",
    }, "123")).toMatchObject({ integrity: "unavailable", roster_rows: [], participation_rows: [] });
  });
});
