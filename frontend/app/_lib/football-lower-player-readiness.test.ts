import { describe, expect, it } from "vitest";
import { validateFootballLowerPlayerReadiness } from "./football-lower-player-readiness";

const ledger = {
  schema_version: 1,
  sport: "football",
  gender: "men",
  season: 2026,
  generated_at: "2026-09-20T00:00:00Z",
  status: "blocked",
  source_contracts: [{
    key: "espn_mfb_group_35_event_summary",
    publisher: "ESPN",
    url: "https://site.api.espn.com/summary?event={event_id}",
    discovery_url: "https://site.api.espn.com/scoreboard?groups=35",
    scope: "combined D2/D3",
    discovery_status: "candidate_unverified",
    expected_fields: ["athlete_id"],
    required_before_import: ["explicit division"],
    reason: "Combined group requires an exact-division join.",
  }],
  divisions: {
    "2": { status: "blocked", candidate_count: 1, blockers: ["missing_division"], rows_published: 0, source_labeled_team_rows: 10, box_rows_mapped_to_source_labeled_teams: 0, unique_athletes_mapped_to_source_labeled_teams: 0, reason: "No rows." },
    "3": { status: "blocked", candidate_count: 1, blockers: ["missing_division"], rows_published: 0, source_labeled_team_rows: 12, box_rows_mapped_to_source_labeled_teams: 0, unique_athletes_mapped_to_source_labeled_teams: 0, reason: "No rows." },
  },
  classification_policy: "Explicit source labels only.",
  required_before_import: ["receipt"],
  limitations: ["No rows published."],
};

describe("football lower-division player readiness", () => {
  it("accepts the explicit blocked ledger and preserves endpoint evidence", () => {
    const result = validateFootballLowerPlayerReadiness(ledger);
    expect(result.status).toBe("blocked");
    expect(result.source_contracts[0].discovery_url).toContain("groups=35");
    expect(result.divisions["2"].rows_published).toBe(0);
    expect(result.divisions["2"].source_labeled_team_rows).toBe(10);
  });

  it("rejects a ledger with a missing division or invented rows", () => {
    expect(() => validateFootballLowerPlayerReadiness({ ...ledger, divisions: { "2": ledger.divisions["2"] } })).toThrow();
    expect(() => validateFootballLowerPlayerReadiness({
      ...ledger,
      divisions: { ...ledger.divisions, "3": { ...ledger.divisions["3"], rows_published: -1 } },
    })).toThrow();
  });
});
