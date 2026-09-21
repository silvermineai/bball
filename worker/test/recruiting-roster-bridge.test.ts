import { describe, expect, it } from "vitest";
import { buildRecruitingRosterBridge } from "../src/recruiting-roster-bridge";

const digest = "a".repeat(64);

describe("recruiting roster bridge", () => {
  it("joins only exact athlete IDs and requires release receipts", () => {
    const result = buildRecruitingRosterBridge("123", [
      { season: 2027, team_id: "1", profile_json: JSON.stringify({ full_name: "Prospect", team_display_name: "Example", position_abbreviation: "G", experience_display_value: "Sophomore" }) },
    ], [
      { season: 2026, team_id: "1", athlete_id: "123", name: "Prospect", games: 28, minutes: 512.5 },
    ], [
      { dataset: "rosters", season: 2027, fetched_at: "2026-09-19T00:00:00Z", sha256: digest },
      { dataset: "player_box", season: 2026, fetched_at: "2026-09-18T00:00:00Z", sha256: digest },
    ]);
    expect(result).toMatchObject({ athlete_id: "123", integrity: "verified" });
    expect(result?.roster_rows[0]).toMatchObject({ team: "Example", position: "G" });
    expect(result?.participation_rows[0]).toMatchObject({ season: 2026, minutes: 512.5 });
  });

  it("withholds malformed rows instead of dropping them", () => {
    expect(buildRecruitingRosterBridge("123", [
      { season: 2027, team_id: "1", profile_json: "{}" },
    ], [], [])).toBeNull();
  });

  it("marks exact rows unavailable when a season has no source receipt", () => {
    const result = buildRecruitingRosterBridge("123", [
      { season: 2027, team_id: "1", profile_json: JSON.stringify({ full_name: "Prospect", team_display_name: "Example" }) },
    ], [], []);
    expect(result).toMatchObject({ athlete_id: "123", integrity: "unavailable" });
  });

  it("rejects participation rows for another athlete", () => {
    expect(buildRecruitingRosterBridge("123", [], [
      { season: 2026, team_id: "1", athlete_id: "999", name: "Other", games: 1, minutes: 1 },
    ], [])).toBeNull();
  });
});
