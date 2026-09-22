import { describe, expect, it, vi } from "vitest";
import app from "../src/index";

describe("football source statistics", () => {
  it("returns a bounded parsed source row with schedule context", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("count(*) AS total")) {
        return { bind: () => ({ first: async () => ({ total: 1 }) }) };
      }
      if (sql.includes("FROM football_sources")) {
        return {
          bind: () => ({
            all: async () => ({ results: [{ dataset: "box", season: 2025, receipt_json: JSON.stringify({ url: "https://example.test/box.csv", fetched_at: "2026-09-01T00:00:00Z", sha256: "a".repeat(64) }) }] }),
          }),
        };
      }
      if (sql.includes("GROUP BY division")) {
        return {
          bind: () => ({
            all: async () => ({ results: [
              { division: "d2", rows: 0, teams: 0 },
              { division: "d3", rows: 12, teams: 2 },
              { division: "unknown", rows: 1, teams: 1 },
            ] }),
          }),
        };
      }
      return {
        bind: () => ({
          all: async () => ({
            results: [{
              dataset: "box",
              season: 2025,
              record_key: "17",
              athlete_id: "123",
              team_id: "8",
              game_id: "401",
              category: "rushing",
              stats_json: JSON.stringify({ athlete_name: "Example Player", yards: "91" }),
              kickoff: "2025-09-01T00:00:00Z",
              home_name: "Home",
              away_name: "Away",
              home_score: 28,
              away_score: 17,
            }],
          }),
        }),
      };
    });
    const response = await app.request(
      "/api/football/source-stats?dataset=box&season=2025&q=Example%20Player&team=8&division=d3&page=0",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {
      source_receipts: Array<Record<string, unknown>>;
    };
    expect(body.source_receipts).toEqual([{
      dataset: "box",
      season: 2025,
      fetched_at: "2026-09-01T00:00:00Z",
      sha256: "a".repeat(64),
    }]);
    expect(body.source_receipts[0]).not.toHaveProperty("url");
    expect(body).toMatchObject({
      dataset: "box",
      season: 2025,
      total: 1,
      filters: { division: "d3" },
      field_catalog: [{ key: "athlete_name", observed_rows: 1, share: 1 }, { key: "yards", observed_rows: 1, share: 1 }],
      field_catalog_scope: "returned_page",
      division_coverage: {
        status: "exact",
        scope: "season_and_dataset",
        rows: [
          { division: "d2", rows: 0, teams: 0 },
          { division: "d3", rows: 12, teams: 2 },
          { division: "unknown", rows: 1, teams: 1 },
        ],
      },
      rows: [{
        athlete_id: "123",
        stats: { athlete_name: "Example Player", yards: "91" },
        game: { id: "401", home_name: "Home", away_name: "Away" },
      }],
    });
    expect(prepare.mock.calls.some(([sql]) => String(sql).includes("instr(lower(s.stats_json ||"))).toBe(true);
    expect(prepare.mock.calls.some(([sql]) => String(sql).includes("COALESCE(g.home_name,'')") && String(sql).includes("COALESCE(g.away_name,'')"))).toBe(true);
    expect(prepare.mock.calls.some(([sql]) => String(sql).includes("COALESCE(s.record_key,'')") && String(sql).includes("COALESCE(s.game_id,'')"))).toBe(true);
    expect(prepare.mock.calls.some(([sql]) => String(sql).includes("SELECT count(*) AS total") && String(sql).includes("LEFT JOIN football_games g ON g.id=s.game_id"))).toBe(true);
    expect(prepare.mock.calls.some(([sql]) => String(sql).includes("team_scope.dataset='teams'") && String(sql).includes("json_extract(team_scope.stats_json,'$.division')"))).toBe(true);
  });

  it("keeps an unavailable division as an explicit team-directory cohort", async () => {
    const prepare = vi.fn((_sql: string) => ({
      bind: () => ({
        first: async () => ({ total: 0 }),
        all: async () => ({ results: [] }),
      }),
    }));
    const response = await app.request("/api/football/source-stats?season=2025&division=unknown", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      season: 2025,
      filters: { division: "unknown" },
    });
    const sql = prepare.mock.calls.map(([query]) => String(query)).join("\n");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("team_scope.dataset='teams'");
    expect(sql).toContain("IN ('fbs','fcs','d2','d3','naia')");
  });

  it("exposes the available seasons and dataset row counts", async () => {
    const prepare = vi.fn((sql: string) => ({
      all: vi.fn().mockResolvedValue({
        results: sql.includes("DISTINCT season") ? [{ season: 2025 }] : [{ dataset: "box", rows: 4 }],
      }),
    }));
    const response = await app.request("/api/football/source-stats?meta=1", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      seasons: [2025],
      datasets: [{ dataset: "box", rows: 4 }],
    });
  });

  it("accepts the earliest published player archive season", async () => {
    const prepare = vi.fn(() => ({
      bind: () => ({
        first: async () => ({ total: 0 }),
        all: async () => ({ results: [] }),
      }),
    }));
    const response = await app.request("/api/football/source-stats?season=2010", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ season: 2010, total: 0 });
  });

  it("falls back to the receipt catalog when the warehouse count is busy", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("FROM football_stats GROUP BY dataset") || sql.includes("DISTINCT season FROM football_stats")) {
        return { all: vi.fn().mockRejectedValue(new Error("D1 busy")) };
      }
      return {
        all: vi.fn().mockResolvedValue({ results: [] }),
        bind: () => ({ all: vi.fn().mockResolvedValue({ results: [] }) }),
      };
    });
    const response = await app.request("/api/football/source-stats?meta=1", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      seasons: [],
      datasets: [],
      counts_deferred: true,
    });
  });
});
