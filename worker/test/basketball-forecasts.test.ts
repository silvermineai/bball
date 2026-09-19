import { describe, expect, it, vi } from "vitest";
import { basketballForecasts } from "../src/basketball-forecasts";

describe("basketball forecast availability", () => {
  it("resolves latest from models that contain forecasts for the requested season", async () => {
    const countBinds: Array<string | number> = [];
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("SELECT count(*) AS total FROM bb_forecasts")) {
        return {
          bind: (...values: Array<string | number>) => {
            countBinds.push(...values);
            return {
              first: async () => ({
                total: sql.includes("g_latest.season=?") ? 1 : 0,
              }),
            };
          },
        };
      }
      return {
        bind: () => ({
          all: async () => ({ results: [{
            game_id: "401",
            model_id: "basketball-efficiency-v2-complete",
            created_at: "2026-09-17T00:00:00Z",
            prediction_json: JSON.stringify({ home_margin: 4.5 }),
            season: 2027,
            starts_at: "2026-11-02T05:00:00Z",
            home_id: "1",
            away_id: "2",
            home_name: "Home",
            away_name: "Away",
            home_score: null,
            away_score: null,
            completed: 0,
            neutral: 0,
            time_tbd: 1,
            venue: null,
            broadcast: null,
            source_start: null,
            source_time_valid: null,
            source_observed_at: null,
          }] }),
        }),
      };
    });

    const response = await basketballForecasts.request(
      "/?season=2027&status=upcoming&model=latest&limit=1",
      {},
      { DB: { prepare } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      rows: [{ game_id: "401", model_id: "basketball-efficiency-v2-complete" }],
    });
    const countSql = String(prepare.mock.calls.find(([sql]) => String(sql).includes("SELECT count(*) AS total FROM bb_forecasts"))?.[0]);
    expect(countSql).toContain("JOIN bb_games g_latest ON g_latest.id=f_latest.game_id");
    expect(countSql).toContain("LEFT JOIN bb_models m_latest ON m_latest.id=f_latest.model_id");
    expect(countSql).toContain("WHERE g_latest.season=?");
    expect(countBinds).toEqual([2027, 2027]);
  });

  it("returns a retryable status when the D1 catalog is unavailable", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const response = await basketballForecasts.request(
      "/?meta=1&season=2027",
      {},
      { DB: { prepare, batch: vi.fn() } },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "The live basketball forecast catalog is temporarily unavailable.",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves the published upcoming board when the forecast warehouse is busy", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2027,
      generated_at: "2026-09-17T10:00:00Z",
      model: { id: "basketball-efficiency-v2-published" },
      upcoming: [
        {
          id: "401",
          season: 2027,
          starts_at: "2026-11-02T05:00:00Z",
          home_id: "1",
          away_id: "2",
          home_name: "Home",
          away_name: "Away",
          completed: 0,
          neutral: 0,
          time_tbd: 1,
          prediction: { home_margin: 4.5, total: 145.5 },
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await basketballForecasts.request(
      "/?season=2027&status=upcoming&limit=1",
      {},
      { DB: { prepare, batch: vi.fn() }, ASSETS: { fetch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { source: string; total: number; rows: Array<Record<string, unknown>> };
    expect(body.source).toBe("published_fallback");
    expect(body.total).toBe(1);
    expect(body.rows[0]).toMatchObject({ game_id: "401", model_id: "basketball-efficiency-v2-published", prediction: { home_margin: 4.5, total: 145.5 } });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("attaches the published roster model lens when requested", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("SELECT count(*) AS total FROM bb_forecasts")) {
        return { bind: () => ({ first: async () => ({ total: 1 }) }) };
      }
      return {
        bind: () => ({
          all: async () => ({ results: [{
            game_id: "401902275",
            model_id: "basketball-efficiency-v2-test",
            created_at: "2026-09-17T00:00:00Z",
            prediction_json: JSON.stringify({ home_margin: 4.5, home_win_probability: 0.62 }),
            season: 2027,
            starts_at: "2026-11-02T05:00:00Z",
            home_id: "2086",
            away_id: "322",
            home_name: "Butler",
            away_name: "Lafayette",
            home_score: null,
            away_score: null,
            completed: 0,
            neutral: 0,
            time_tbd: 1,
            venue: "Hinkle Fieldhouse",
            broadcast: null,
            source_start: null,
            source_time_valid: null,
            source_observed_at: null,
          }] }),
        }),
      };
    });
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      version: "basketball-roster-challenger-v1",
      generated_at: "2026-09-17T00:00:00Z",
      coverage: { scenario_games: 1, current_predicted_teams: 2 },
      evaluation: { held_out_transition: 2026, improvement_vs_prior_net: 0.5, mae: 10.4 },
      scenarios: [{
        game_id: "401902275",
        home_id: "2086",
        away_id: "322",
        base_margin: 4.5,
        roster_margin: 5.1,
        margin_delta: 0.6,
        home_predicted_net: 2.1,
        away_predicted_net: -3.4,
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await basketballForecasts.request(
      "/?season=2027&status=upcoming&roster=1&limit=1",
      {},
      { DB: { prepare }, ASSETS: { fetch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { roster_model: Record<string, unknown>; rows: Array<Record<string, unknown>> };
    expect(body.roster_model).toMatchObject({ version: "basketball-roster-challenger-v1", scenario_games: 1, improvement_vs_prior_net: 0.5 });
    expect(body.rows[0].roster_lens).toMatchObject({ game_id: "401902275", roster_margin: 5.1, margin_delta: 0.6 });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
