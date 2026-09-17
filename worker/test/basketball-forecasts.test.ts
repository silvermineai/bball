import { describe, expect, it, vi } from "vitest";
import { basketballForecasts } from "../src/basketball-forecasts";

describe("basketball forecast availability", () => {
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
