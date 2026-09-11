import { describe, expect, it, vi } from "vitest";
import { footballRecruiting } from "../src/football-recruiting";

const receipt = JSON.stringify({ url: "https://example.test/release.parquet", fetched_at: "2026-09-11T00:00:00Z", sha256: "a".repeat(64) });

describe("football recruiting desk", () => {
  it("shapes a source roster row while preserving raw fields", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: () => ({
        first: async () => sql.includes("count(*)") ? { total: 1 } : undefined,
        all: async () => sql.includes("football_sources") ? { results: [{ dataset: "rosters", season: 2026, receipt_json: receipt }] } : { results: [{ record_key: "0", athlete_id: "123", team_id: "5", stats_json: JSON.stringify({ full_name: "Example Player", team_display_name: "UAB Blazers", position_name: "Quarterback", experience_display_value: "Senior", status_name: "Active", height: "74", weight: "210", active: "true" }) }] },
      }),
    }));
    const response = await footballRecruiting.request("/?view=rosters&season=2026", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ total: 1, source_receipts: [{ dataset: "rosters" }], rows: [{ id: "123", name: "Example Player", team: "UAB Blazers", position: "Quarterback", active: true, raw: { full_name: "Example Player" } }] });
  });

  it("returns a retryable response when the recruiting warehouse is busy", async () => {
    const response = await footballRecruiting.request("/?view=talent&season=2026", {}, { DB: { prepare: () => ({ bind: () => ({ all: vi.fn().mockRejectedValue(new Error("D1 busy")) }) }) } });
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "The football recruiting archive is temporarily unavailable." });
  });

  it("keeps metadata bounded and receipt-backed", async () => {
    const prepare = vi.fn((sql: string) => ({ all: async () => ({ results: sql.includes("DISTINCT season") ? [{ season: 2026 }] : sql.includes("count(*)") ? [{ dataset: "team_talent", season: 2026, rows: 1 }] : [{ dataset: "team_talent", season: 2026, receipt_json: receipt }] }) }));
    const response = await footballRecruiting.request("/?meta=1", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ seasons: [2026], receipts: [{ dataset: "team_talent", sha256: "a".repeat(64) }] });
  });
});
