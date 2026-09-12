import { describe, expect, it, vi } from "vitest";
import { recruitingRankings } from "../src/recruiting-rankings";

describe("ESPN recruiting rankings", () => {
  it("returns source-labeled ranked prospects with parsed school IDs", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => sql.includes("count(*)") ? { total: 1, committed_total: 1, ranked_total: 1, grade_total: 1 } : { edition: "edition-1", captured_at: "2026-09-12T00:00:00Z" }),
        all: vi.fn(async () => ({ results: sql.includes("CAST(r.committed_team_id AS TEXT)") ? [{ team_id: "2755", team: "PG", total: 1, ranked_total: 1, top100_total: 1, best_rank: 1, average_rank: 1 }] : sql.includes("GROUP BY") ? [{ position: "PG", total: 1 }] : [{ athlete_id: "272415", name: "Danny Abass", rank: 225, committed_team_id: "2755", school_ids_json: '["257","526"]' }] })),
      })),
    }));
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; cohort: { committed: number; ranked: number; graded: number }; position_breakdown: Array<{ position: string; total: number }>; commitment_destinations: Array<{ team_id: string | null; team: string; total: number; ranked_total: number; top100_total: number; best_rank: number | null; average_rank: number | null }>; rows: Array<{ name: string; school_ids: string[]; school_ids_json?: string }> };
    expect(body.total).toBe(1);
    expect(body.cohort).toEqual({ committed: 1, ranked: 1, graded: 1 });
    expect(body.position_breakdown).toEqual([{ position: "PG", total: 1 }]);
    expect(body.commitment_destinations).toEqual([{ team_id: "2755", team: "PG", total: 1, ranked_total: 1, top100_total: 1, best_rank: 1, average_rank: 1 }]);
    expect(body.rows[0]).toEqual(expect.objectContaining({ name: "Danny Abass", committed_team_id: "2755", school_ids: ["257", "526"] }));
    expect(body.rows[0].school_ids_json).toBeUndefined();
  });

  it("fails closed with a 200 unavailable response when D1 is unavailable", async () => {
    const response = await recruitingRankings.request("/?season=2027", {}, { RESEARCH_DB: { prepare: vi.fn(() => { throw new Error("busy"); }) } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ source: "unavailable", rows: [] }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("supports exact athlete lookups for stable prospect dossiers", async () => {
    const bind = vi.fn(() => ({
      first: vi.fn(async () => ({ total: 1, committed_total: 0, ranked_total: 1, grade_total: 1 })),
      all: vi.fn(async () => ({ results: [{ athlete_id: "272415", name: "Danny Abass", rank: 225, school_ids_json: "[]" }] })),
    }));
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => { sqlCalls.push(sql); return { bind }; });
    const response = await recruitingRankings.request("/?season=2027&athlete_id=272415&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    expect(sqlCalls[0]).toContain("r.athlete_id=?");
    expect(bind.mock.calls[0]).toContain("272415");
    expect((await response.json() as { total: number }).total).toBe(1);
  });

  it("escapes wildcard characters in prospect searches", async () => {
    const bind = vi.fn(() => ({
      first: vi.fn(async () => ({ total: 0, committed_total: 0, ranked_total: 0, grade_total: 0 })),
      all: vi.fn(async () => ({ results: [] })),
    }));
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => { sqlCalls.push(sql); return { bind }; });
    const response = await recruitingRankings.request("/?season=2027&q=100%25_under&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    expect(sqlCalls.some((sql) => sql.includes("ESCAPE '\\'"))).toBe(true);
    expect(bind.mock.calls.some((args) => args.some((value) => value === "%100\\%\\_under%"))).toBe(true);
  });

  it("applies a bounded source-rank cutoff", async () => {
    const bind = vi.fn((..._args: unknown[]) => ({
      first: vi.fn(async () => ({ total: 27, committed_total: 10, ranked_total: 27, grade_total: 27 })),
      all: vi.fn(async () => ({ results: [] })),
    }));
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => { sqlCalls.push(sql); return { bind }; });
    const response = await recruitingRankings.request("/?season=2027&rank_max=25&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    expect(sqlCalls.some((sql) => sql.includes("r.rank IS NOT NULL AND r.rank<=?"))).toBe(true);
    expect(bind.mock.calls.some((args) => args.includes(25))).toBe(true);
    expect((await response.json() as { total: number }).total).toBe(27);
  });
});
