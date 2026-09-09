import { describe, it, expect, vi } from "vitest";
import { careers } from "../src/careers";
const sourceDigest = "b".repeat(64);
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
  it("reports bounded D1 archive metadata without exposing player rows", async () => {
    const prepare = vi.fn((sql: string) => {
      const result = {
        results: sql.includes("bb_career_seasons") ? [{
          season: 2026,
          edition: "edition-2026",
          coverage_json: JSON.stringify({ identified_rows: 12, player_team_entries: 8, appearance_games: 20, completed_schedule_games: 21, missing_identity: 2 }),
          receipt_json: JSON.stringify([{ fetched_at: "2026-09-09T12:00:00Z" }]),
        }] : [],
      };
      return {
        all: async () => result,
        bind: vi.fn(() => ({ all: async () => result })),
      };
    });
    const response = await careers.request("/meta", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    const data = await response.json() as { seasons: Array<Record<string, unknown>>; latest_receipt: string };
    expect(data.seasons).toHaveLength(1);
    expect(data.seasons[0]).toMatchObject({ season: 2026, identified_rows: 12, player_team_entries: 8, latest_receipt: "2026-09-09T12:00:00Z" });
    expect(data.latest_receipt).toBe("2026-09-09T12:00:00Z");
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("coverage_json"));
  });

  it("streams the exact historical player-box release and honors validators", async () => {
    const get = vi.fn(async () => ({ body: new Response("PARQUET").body }));
    const bindings = {
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: async () => ({
              receipt_json: JSON.stringify([
                { dataset: "schedule", season: 2026, sha256: "c".repeat(64) },
                { dataset: "player_box", season: 2026, sha256: sourceDigest },
              ]),
            }),
          })),
        })),
      },
      RESEARCH_ARCHIVE: { get },
    };
    const response = await careers.request("/source?season=2026", {}, bindings);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("player_box_2026.parquet");
    expect(await response.text()).toBe("PARQUET");
    expect(get).toHaveBeenCalledWith(`basketball/careers/player-box/2026/${sourceDigest}.parquet`);
    const cached = await careers.request("/source?season=2026", { headers: { "If-None-Match": `"${sourceDigest}"` } }, bindings);
    expect(cached.status).toBe(304);
    expect(get).toHaveBeenCalledTimes(1);
  });

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
  it("attaches field coverage only when the static audit matches the D1 edition", async () => {
    const env = {
      ...database(),
      ASSETS: {
        fetch: vi.fn(async () => new Response(JSON.stringify({
          seasons: [{
            season: 2026,
            edition: "one",
            field_coverage: { pts: { source_observed: 7, appearance_observed: 6 } },
          }],
        }), { status: 200, headers: { "Content-Type": "application/json" } })),
      },
    };
    const response = await careers.request("/123", {}, env);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      coverage: { field_coverage?: { pts?: { source_observed: number } } };
    };
    expect(data.coverage.field_coverage?.pts?.source_observed).toBe(7);
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
