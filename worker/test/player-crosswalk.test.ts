import { describe, expect, it, vi } from "vitest";
import { playerCrosswalk } from "../src/player-crosswalk";

describe("basketball player crosswalk", () => {
  it("returns provider coverage and source receipt metadata", async () => {
    const db = {
      batch: vi.fn(async () => [
        { results: [{ season: 2026 }] },
        { results: [{ rows: 10, players: 9, fox_ids: 8, yahoo_ids: 3 }] },
        { results: [{ url: "https://example.test/release.parquet", fetched_at: "2026-09-01T00:00:00Z", sha256: "a".repeat(64) }] },
      ]),
      prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first: async () => null, all: async () => ({ results: [] }) })) })),
    };
    const response = await playerCrosswalk.request("/?meta=1", {}, { RESEARCH_DB: db });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      season: 2026,
      rows: 10,
      players: 9,
      fox_ids: 8,
      yahoo_ids: 3,
      source: { sha256: "a".repeat(64) },
    });
  });

  it("filters exact ESPN IDs without weakening the source namespace", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: async () => (sql.includes("COUNT") ? { total: 1 } : null),
        all: async () => ({
          results: [{ season: 2026, espn_athlete_id: "5241312", fox_athlete_id: "76284", match_method: "exact_name", match_confidence: 1 }],
        }),
      })),
    }));
    const response = await playerCrosswalk.request("/?espnId=5241312&provider=fox", {}, { RESEARCH_DB: { prepare, batch: async () => [] } });
    expect(response.status).toBe(200);
    const body = await response.json() as { rows: Array<Record<string, unknown>> };
    expect(body.rows[0]).toMatchObject({ espn_athlete_id: "5241312", fox_athlete_id: "76284", match_confidence: 1 });
    const sql = prepare.mock.calls.map(([value]) => value as string).join(" ");
    expect(sql).toContain("espn_athlete_id=?");
    expect(sql).toContain("fox_athlete_id IS NOT NULL");
  });
});
