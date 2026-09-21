import { describe, expect, it, vi } from "vitest";
import { footballRecruiting } from "../src/football-recruiting";

const receipt = JSON.stringify({ url: "https://example.test/release.parquet", fetched_at: "2026-09-11T00:00:00Z", sha256: "a".repeat(64) });

describe("football recruiting desk", () => {
  it("returns a reconciled recruiting class summary for active filters", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: () => ({
        first: async () => sql.includes("json_extract")
          ? { total: 5, programs: 2, graded: 4, average_grade: 87.25, five_star: 1, four_star: 1, three_star: 2, two_or_less_star: 0, stars_unavailable: 1 }
          : sql.includes("count(*)") ? { total: 5 } : undefined,
        all: async () => sql.includes("football_sources")
          ? { results: [{ dataset: "recruits", season: 2026, receipt_json: receipt }] }
          : { results: [] },
      }),
    }));
    const response = await footballRecruiting.request("/?view=recruits&season=2026&q=quarterback", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      summary: {
        total: 5,
        programs: 2,
        graded: 4,
        average_grade: 87.25,
        star_counts: { five: 1, four: 1, three: 2, two_or_less: 0, unavailable: 1 },
      },
    });
    const summarySql = prepare.mock.calls.find(([sql]) => sql.includes("json_extract"))?.[0] || "";
    expect(summarySql).toContain("s.dataset=? AND s.season=?");
    expect(summarySql).toContain("s.stats_json");
  });

  it("shapes a source roster row while preserving raw fields", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: () => ({
        first: async () => sql.includes("count(*)") ? { total: 1 } : undefined,
        all: async () => sql.includes("football_sources") ? { results: [{ dataset: "rosters", season: 2026, receipt_json: receipt }] } : { results: [{ record_key: "0", athlete_id: "123", team_id: "5", stats_json: JSON.stringify({ full_name: "Example Player", team_display_name: "UAB Blazers", position_name: "Quarterback", experience_display_value: "Senior", status_name: "Active", height: "74", weight: "210", active: "true" }) }] },
      }),
    }));
    const response = await footballRecruiting.request("/?view=rosters&season=2026", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; source_receipts: Array<Record<string, unknown>>; rows: Array<Record<string, unknown>> };
    expect(body).toMatchObject({ total: 1, source_receipts: [{ dataset: "rosters" }], rows: [{ id: "123", name: "Example Player", team: "UAB Blazers", position: "Quarterback", active: true, raw: { full_name: "Example Player" } }] });
    expect(body.source_receipts[0]).not.toHaveProperty("url");
  });

  it("adds exact team-directory division context to recruiting rows", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("json_extract(s.stats_json,'$.grade')")) {
        return { bind: () => ({ first: async () => ({ total: 1, programs: 1, graded: 1, average_grade: 84, five_star: 0, four_star: 0, three_star: 1, two_or_less_star: 0, stars_unavailable: 0 }) }) };
      }
      if (sql.includes("SELECT count(*)")) {
        return { bind: () => ({ first: async () => ({ total: 1 }) }) };
      }
      if (sql.includes("dataset='teams'")) {
        return { bind: () => ({ all: async () => ({ results: [{ team_id: "5", stats_json: JSON.stringify({ division: "fcs", conference_short_name: "Pioneer" }) }] }) }) };
      }
      if (sql.includes("football_sources")) {
        return { bind: () => ({ all: async () => ({ results: [{ dataset: "recruits", season: 2026, receipt_json: receipt }] }) }) };
      }
      if (sql.includes("SELECT record_key")) {
        return { bind: () => ({ all: async () => ({ results: [{ record_key: "0", athlete_id: null, team_id: "5", stats_json: JSON.stringify({ recruit_id: "r1", player_name: "Example Recruit", team: "Example State", stars: "3", grade: "84", position: "QB" }) }] }) }) };
      }
      return { bind: () => ({ first: async () => ({ total: 1 }) }) };
    });
    const response = await footballRecruiting.request("/?view=recruits&season=2026&division=fcs", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { filters: Record<string, unknown>; division_scope: Record<string, unknown>; rows: Array<Record<string, unknown>> };
    expect(body).toMatchObject({ filters: { division: "fcs" }, division_scope: { requested: "fcs" }, rows: [{ division: "fcs", conference: "Pioneer" }] });
    const filteredSql = prepare.mock.calls.find(([sql]) => String(sql).includes("SELECT record_key"))?.[0] || "";
    expect(filteredSql).toContain("EXISTS (SELECT 1 FROM football_stats team_scope");
    expect(filteredSql).toContain("team_scope.team_id=s.team_id");
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
    const body = await response.json() as { receipts: Array<Record<string, unknown>>; seasons: number[]; coverage: Record<string, unknown> };
    expect(body).toMatchObject({ seasons: [2026], receipts: [{ dataset: "team_talent", sha256: "a".repeat(64) }], coverage: { completeness: "not_established" } });
    expect(body.receipts[0]).not.toHaveProperty("url");
  });
});
