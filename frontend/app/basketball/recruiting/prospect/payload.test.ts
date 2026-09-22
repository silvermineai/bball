import { describe, expect, it } from "vitest";
import { parseProspectDossierPayload } from "./payload";

const prospect = {
  athlete_id: "42",
  name: "A. Example",
  position: "F",
  rank: 12,
  position_rank: 3,
  state_rank: null,
  region_rank: 7,
  grade: 96,
  status: "committed",
  committed_team_id: "123",
  committed_team_name: "Example State",
  high_school: null,
  hometown: "Example, AZ",
  height_inches: 79,
  weight_pounds: null,
  captured_at: "2026-09-01T00:00:00Z",
  source_url: "",
  previous_rank: null,
  previous_captured_at: null,
  school_ids: ["123", "456"],
};

const response = (overrides: Record<string, unknown> = {}) => ({
  season: 2027,
  rows: [prospect],
  edition: "a".repeat(64),
  captured_at: "2026-09-01T00:00:00Z",
  ...overrides,
});

describe("parseProspectDossierPayload", () => {
  it("admits one exact athlete ID and preserves recorded nulls", () => {
    const parsed = parseProspectDossierPayload(response(), 2027, "42");
    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.rows[0].athlete_id).toBe("42");
    expect(parsed?.rows[0].state_rank).toBeNull();
    expect(parsed?.rows[0].high_school).toBeNull();
    expect(parsed?.rows[0].school_ids).toEqual(["123", "456"]);
  });

  it("rejects a neighboring row or duplicate exact IDs", () => {
    expect(parseProspectDossierPayload(response(), 2027, "43")).toBeNull();
    expect(parseProspectDossierPayload(response({ rows: [{ ...prospect, athlete_id: "42" }, prospect] }), 2027, "42")).toBeNull();
    expect(parseProspectDossierPayload(response({ rows: [{ ...prospect, athlete_id: 42 }] }), 2027, "42")).toBeNull();
  });

  it("withholds malformed numeric, timestamp and school-list fields", () => {
    expect(parseProspectDossierPayload(response({ rows: [{ ...prospect, rank: 0 }] }), 2027, "42")).toBeNull();
    expect(parseProspectDossierPayload(response({ rows: [{ ...prospect, height_inches: -1 }] }), 2027, "42")).toBeNull();
    expect(parseProspectDossierPayload(response({ rows: [{ ...prospect, captured_at: "not-a-date" }] }), 2027, "42")).toBeNull();
    expect(parseProspectDossierPayload(response({ rows: [{ ...prospect, school_ids: ["123", 456] }] }), 2027, "42")).toBeNull();
  });

  it("rejects malformed receipts instead of claiming a verified edition", () => {
    expect(parseProspectDossierPayload(response({ source_receipt: { dataset: "recruiting_rankings", captured_at: "bad", source_rows: 1, sha256: "bad", sha256_scope: "release_edition", integrity: "verified" } }), 2027, "42")).toBeNull();
  });
});
