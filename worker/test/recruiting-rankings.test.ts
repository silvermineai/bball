import { describe, expect, it, vi } from "vitest";
import { recruitingRankings } from "../src/recruiting-rankings";

describe("ESPN recruiting rankings", () => {
  it("returns source-labeled ranked prospects with parsed school IDs", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => sql.includes("HAVING count(*) > 1") ? { tied_rank_values: 1, tied_rows: 2 } : sql.includes("count(*)") ? { total: 1, committed_total: 1, ranked_total: 1, grade_total: 1 } : { edition: "edition-1", captured_at: "2026-09-12T00:00:00Z" }),
        all: vi.fn(async () => ({ results: sql.includes("COALESCE(NULLIF(upper(r.position)") ? [{ team_id: "2755", position: "PG", total: 1 }] : sql.includes("CAST(r.committed_team_id AS TEXT)") ? [{ team_id: "2755", team: "PG", total: 1, ranked_total: 1, top100_total: 1, best_rank: 1, average_rank: 1 }] : sql.includes("GROUP BY") ? [{ position: "PG", total: 1 }] : [{ athlete_id: "272415", name: "Danny Abass", rank: 225, committed_team_id: "2755", school_ids_json: '["257","526"]' }] })),
      })),
    }));
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; cohort: { committed: number; ranked: number; graded: number }; rank_quality: { tied_rank_values: number; tied_rows: number }; position_breakdown: Array<{ position: string; total: number }>; commitment_destinations: Array<{ team_id: string | null; team: string; total: number; ranked_total: number; top100_total: number; best_rank: number | null; average_rank: number | null; position_breakdown: Array<{ position: string; total: number }> }>; rows: Array<{ name: string; school_ids: string[]; school_ids_json?: string }> };
    expect(body.total).toBe(1);
    expect(body.cohort).toEqual({ committed: 1, ranked: 1, graded: 1 });
    expect(body.rank_quality).toEqual({ ranked_rows: 1, tied_rank_values: 1, tied_rows: 2 });
    expect(body.position_breakdown).toEqual([{ position: "PG", total: 1 }]);
    expect(body.commitment_destinations).toEqual([{ team_id: "2755", team: "PG", total: 1, ranked_total: 1, top100_total: 1, best_rank: 1, average_rank: 1, position_breakdown: [{ position: "PG", total: 1 }] }]);
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

  it("returns the complete retained rank history for an exact athlete lookup", async () => {
    const history = [
      { edition: "august", captured_at: "2026-08-01T00:00:00Z", rank: 42, grade: 96, status: "", committed_team_id: null, committed_team_name: null, source_url: "https://espn.test/42" },
      { edition: "september", captured_at: "2026-09-01T00:00:00Z", rank: 31, grade: 97, status: "", committed_team_id: "2755", committed_team_name: "Example", source_url: "https://espn.test/31" },
    ];
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("ORDER BY captured_at ASC")) return { bind: vi.fn(() => ({ all: vi.fn(async () => ({ results: history })) })) };
      if (sql.includes("SELECT r.athlete_id")) return { bind: vi.fn(() => ({ all: vi.fn(async () => ({ results: [{ athlete_id: "272415", name: "Danny Abass", rank: 31, school_ids_json: "[]" }] })) })) };
      if (sql.includes("WITH current_rows")) return { bind: vi.fn(() => ({ first: vi.fn(async () => ({ total: 1, new_to_release: 0, moved_up: 1, moved_down: 0, unchanged: 0, rank_unavailable: 0 })) })) };
      return { bind: vi.fn(() => ({ first: vi.fn(async () => sql.includes("bb_espn_recruiting_current") && sql.includes("SELECT edition") ? { edition: "september", captured_at: "2026-09-01T00:00:00Z" } : sql.includes("count(*)") ? { total: 1, committed_total: 1, ranked_total: 1, grade_total: 1 } : { tied_rank_values: 0, tied_rows: 0 }), all: vi.fn(async () => ({ results: [] })) })) };
    });
    const response = await recruitingRankings.request("/?season=2027&athlete_id=272415&history=1&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { history: Array<{ edition: string; rank: number | null }> };
    expect(body.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ edition: "august", rank: 42 }),
      expect.objectContaining({ edition: "september", rank: 31 }),
    ]));
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

  it("returns release-to-release movement alongside the current row", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("WITH current_rows")) return {
        bind: vi.fn(() => ({ first: vi.fn(async () => ({ total: 3, new_to_release: 1, moved_up: 1, moved_down: 1, unchanged: 0, rank_unavailable: 0 })) })),
      };
      if (sql.includes("SELECT r.athlete_id")) return {
        bind: vi.fn(() => ({ all: vi.fn(async () => ({ results: [{ athlete_id: "7", name: "Ava Example", rank: 12, previous_rank: 18, previous_captured_at: "2026-08-01T00:00:00Z", school_ids_json: "[]" }] })) })),
      };
      return {
        bind: vi.fn(() => ({
          first: vi.fn(async () => ({ total: 1, committed_total: 0, ranked_total: 1, grade_total: 1 })),
          all: vi.fn(async () => ({ results: [] })),
        })),
      };
    });
    const response = await recruitingRankings.request("/?season=2027&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { rank_movement: { moved_up: number; moved_down: number; new_to_release: number }; rows: Array<{ previous_rank: number; previous_captured_at: string }> };
    expect(body.rank_movement).toEqual(expect.objectContaining({ moved_up: 1, moved_down: 1, new_to_release: 1 }));
    expect(body.rows[0]).toEqual(expect.objectContaining({ previous_rank: 18, previous_captured_at: "2026-08-01T00:00:00Z" }));
  });

  it("adds an exact release movement filter to the bounded query", async () => {
    const sqlCalls: string[] = [];
    const prepare = vi.fn((sql: string) => {
      sqlCalls.push(sql);
      return {
        bind: vi.fn(() => ({
          first: vi.fn(async () => sql.includes("count(*)") ? { total: 0, committed_total: 0, ranked_total: 0, grade_total: 0 } : { edition: "edition-1", captured_at: "2026-09-12T00:00:00Z" }),
          all: vi.fn(async () => ({ results: [] })),
        })),
      };
    });
    const response = await recruitingRankings.request("/?season=2027&movement=up&page=0", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    expect(sqlCalls.some((sql) => sql.includes("r.rank < (SELECT p.rank"))).toBe(true);
  });
});
