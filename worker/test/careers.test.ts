import { describe, it, expect, vi } from "vitest";
import { careers } from "../src/careers";
function database({ mismatch = false, none = false } = {}) {
  const profile = {
    id: "123",
    name: "Example",
    season: 2026,
    overall: { games: 1 },
    teams: [],
  };
  const prepare = vi.fn((sql: string) => ({
    bind: vi.fn(() => ({
      all: async () => ({
        results: sql.includes("bb_career_profiles")
          ? none
            ? []
            : [
                {
                  season: 2026,
                  edition: "one",
                  payload_json: JSON.stringify(profile),
                },
              ]
          : [
              {
                payload_json: JSON.stringify([
                  { id: "401234567", team_id: "10", stats: { pts: 12 } },
                ]),
              },
            ],
      }),
      first: async () => ({
        edition: mismatch ? "two" : "one",
        receipt_json: "[]",
        coverage_json: '{"season":2026}',
      }),
    })),
  }));
  return { DB: { prepare } };
}
describe("historical careers API", () => {
  it("rejects malformed source IDs and unsupported season parameters", async () => {
    for (const url of [
      "/invalid",
      "/0",
      "/123?season=2026.5",
      "/123?season=2002",
      "/123?season=2027",
    ])
      expect((await careers.request(url)).status).toBe(400);
  });
  it("returns exact source IDs, selected logs and versioned season profiles", async () => {
    const env = database();
    const response = await careers.request("/123", {}, env);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      season: number;
      rows: { id: string }[];
      identity_review_required: boolean;
    };
    expect(data.season).toBe(2026);
    expect(data.rows[0].id).toBe("401234567");
    expect(data.identity_review_required).toBe(false);
    expect(env.DB.prepare.mock.calls[0][0]).toContain("s.edition=p.edition");
  });
  it("does not mix logs and summaries across an activating edition", async () => {
    expect(
      (await careers.request("/123", {}, database({ mismatch: true }))).status,
    ).toBe(503);
  });
  it("reports absent historical identities", async () => {
    expect(
      (await careers.request("/123", {}, database({ none: true }))).status,
    ).toBe(404);
  });
});
