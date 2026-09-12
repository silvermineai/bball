import { describe, expect, it, vi } from "vitest";
import { recruitingRankings } from "../src/recruiting-rankings";

describe("ESPN recruiting rankings", () => {
  it("returns source-labeled ranked prospects with parsed school IDs", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => sql.includes("count(*)") ? { total: 1 } : { edition: "edition-1", captured_at: "2026-09-12T00:00:00Z" }),
        all: vi.fn(async () => ({ results: [{ athlete_id: "272415", name: "Danny Abass", rank: 225, school_ids_json: '["257","526"]' }] })),
      })),
    }));
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; rows: Array<{ name: string; school_ids: string[]; school_ids_json?: string }> };
    expect(body.total).toBe(1);
    expect(body.rows[0]).toEqual(expect.objectContaining({ name: "Danny Abass", school_ids: ["257", "526"] }));
    expect(body.rows[0].school_ids_json).toBeUndefined();
  });

  it("fails closed with a 200 unavailable response when D1 is unavailable", async () => {
    const response = await recruitingRankings.request("/?season=2027", {}, { RESEARCH_DB: { prepare: vi.fn(() => { throw new Error("busy"); }) } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ source: "unavailable", rows: [] }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
