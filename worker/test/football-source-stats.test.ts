import { describe, expect, it, vi } from "vitest";
import app from "../src/index";

describe("football source statistics", () => {
  it("returns a bounded parsed source row with schedule context", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("count(*) AS total")) {
        return { bind: () => ({ first: async () => ({ total: 1 }) }) };
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
      "/api/football/source-stats?dataset=box&season=2025&q=Example%20Player&team=8&page=0",
      {},
      { DB: { prepare } },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      dataset: "box",
      season: 2025,
      total: 1,
      rows: [{
        athlete_id: "123",
        stats: { athlete_name: "Example Player", yards: "91" },
        game: { id: "401", home_name: "Home", away_name: "Away" },
      }],
    });
    expect(prepare.mock.calls.some(([sql]) => String(sql).includes("instr(lower(s.stats_json)"))).toBe(true);
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
});
