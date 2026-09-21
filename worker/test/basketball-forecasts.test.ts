import { describe, expect, it, vi } from "vitest";
import { basketballForecasts, parseForecastMatchupFactors, parseForecastPrediction } from "../src/basketball-forecasts";

describe("basketball forecast availability", () => {
  it("withholds forecast objects with invalid known numeric fields", () => {
    expect(parseForecastPrediction({
      home_margin: 4,
      home_win_probability: 1.01,
      margin_low: -8,
      margin_high: 12,
    })).toEqual({ prediction: null, integrity: "invalid" });
    expect(parseForecastPrediction({
      home_margin: 14,
      home_win_probability: 0.7,
      margin_low: -4,
      margin_high: 8,
    })).toEqual({ prediction: null, integrity: "invalid" });
    expect(parseForecastPrediction({
      home_margin: 4,
      home_win_probability: 0.62,
      margin_low: -8,
      margin_high: 12,
      estimate_type: "primary",
    })).toEqual({
      prediction: {
        home_margin: 4,
        home_win_probability: 0.62,
        margin_low: -8,
        margin_high: 12,
        estimate_type: "primary",
      },
      integrity: "valid",
    });
  });

  it("validates four-factor matchup context and keeps malformed context unavailable", () => {
    const valid = parseForecastMatchupFactors({
      season: 2026,
      factors: {
        efg: { home_offense: 0.53, home_defense: 0.5, away_offense: 0.49, away_defense: 0.52 },
        tov: { home_offense: 0.16, home_defense: 0.15, away_offense: 0.17, away_defense: 0.16 },
        orb: { home_offense: 0.3, home_defense: 0.28, away_offense: 0.25, away_defense: 0.3 },
        ftr: { home_offense: 0.38, home_defense: 0.26, away_offense: 0.31, away_defense: 0.32 },
      },
      edges: { efg: 0.02, tov: 0.01, orb: 0.03, ftr: -0.01 },
    });
    expect(valid.integrity).toBe("valid");
    expect(valid.factors?.factors.efg.home_offense).toBe(0.53);
    expect(parseForecastMatchupFactors({
      season: 2026,
      factors: { efg: { home_offense: 1.3 } },
      edges: { efg: 0.02 },
    })).toEqual({ factors: null, integrity: "invalid" });
    expect(parseForecastMatchupFactors(null)).toEqual({ factors: null, integrity: "unavailable" });
  });

  it("derives efficiency for older score-and-pace editions without changing the forecast", () => {
    expect(parseForecastPrediction({ home_score: 80, away_score: 64, pace: 70, home_margin: 16 })).toEqual({
      prediction: { home_score: 80, away_score: 64, pace: 70, home_margin: 16, home_efficiency: 114.29, away_efficiency: 91.43 },
      integrity: "valid",
    });
    expect(parseForecastPrediction({ home_score: 80, away_score: 64, pace: 0 })).toEqual({
      prediction: { home_score: 80, away_score: 64, pace: 0 },
      integrity: "valid",
    });
  });

  it("adds published four-factor context to a live D1 forecast row", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("SELECT count(*) AS total FROM bb_forecasts")) {
        return { bind: () => ({ first: async () => ({ total: 1 }) }) };
      }
      return {
        bind: () => ({
          all: async () => ({ results: [{
            game_id: "401",
            model_id: "basketball-efficiency-v2-current",
            created_at: "2026-09-19T00:00:00Z",
            prediction_json: JSON.stringify({ home_margin: 4.5, home_win_probability: 0.62 }),
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
            time_tbd: 0,
            venue: null,
            broadcast: null,
            source_start: null,
            source_time_valid: null,
            source_observed_at: null,
          }] }),
        }),
      };
    });
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2027,
      generated_at: "2026-09-17T10:00:00Z",
      model: { id: "basketball-efficiency-v2-published" },
      upcoming: [{
        id: "401",
        matchup_factors: {
          season: 2026,
          factors: {
            efg: { home_offense: 0.53, home_defense: 0.5, away_offense: 0.49, away_defense: 0.52 },
            tov: { home_offense: 0.16, home_defense: 0.15, away_offense: 0.17, away_defense: 0.16 },
            orb: { home_offense: 0.3, home_defense: 0.28, away_offense: 0.25, away_defense: 0.3 },
            ftr: { home_offense: 0.38, home_defense: 0.26, away_offense: 0.31, away_defense: 0.32 },
          },
          edges: { efg: 0.02, tov: 0.01, orb: 0.03, ftr: -0.01 },
        },
      }],
    }), { status: 200 }));
    const response = await basketballForecasts.request(
      "/?season=2027&status=upcoming&model=latest&limit=1",
      {},
      { DB: { prepare }, ASSETS: { fetch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { rows: Array<Record<string, unknown>> };
    expect(body.rows[0]).toMatchObject({
      matchup_factors_integrity: "valid",
      matchup_factors_source: "published_asset",
      matchup_factors_model_id: "basketball-efficiency-v2-published",
      matchup_factors_generated_at: "2026-09-17T10:00:00Z",
      matchup_factors_same_edition: false,
      matchup_factors: { season: 2026, edges: { efg: 0.02 } },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("labels embedded four-factor context with the forecast row edition", async () => {
    const factors = {
      season: 2026,
      factors: {
        efg: { home_offense: 0.53, home_defense: 0.5, away_offense: 0.49, away_defense: 0.52 },
        tov: { home_offense: 0.16, home_defense: 0.15, away_offense: 0.17, away_defense: 0.16 },
        orb: { home_offense: 0.3, home_defense: 0.28, away_offense: 0.25, away_defense: 0.3 },
        ftr: { home_offense: 0.38, home_defense: 0.26, away_offense: 0.31, away_defense: 0.32 },
      },
      edges: { efg: 0.02, tov: 0.01, orb: 0.03, ftr: -0.01 },
    };
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("SELECT count(*) AS total FROM bb_forecasts")) {
        return { bind: () => ({ first: async () => ({ total: 1 }) }) };
      }
      return {
        bind: () => ({
          all: async () => ({ results: [{
            game_id: "402",
            model_id: "model-embedded",
            created_at: "2026-09-20T00:00:00Z",
            prediction_json: JSON.stringify({ home_margin: 4.5, home_win_probability: 0.62, matchup_factors: factors }),
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
            time_tbd: 0,
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
    const body = await response.json() as { rows: Array<Record<string, unknown>> };
    expect(body.rows[0]).toMatchObject({
      matchup_factors_integrity: "valid",
      matchup_factors_source: "forecast_payload",
      matchup_factors_model_id: "model-embedded",
      matchup_factors_generated_at: "2026-09-20T00:00:00Z",
      matchup_factors_same_edition: true,
      matchup_factors: factors,
    });
  });

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
    expect(countSql).toContain("JOIN bb_models m_latest ON m_latest.id=f_latest.model_id");
    expect(countSql).toContain("WHERE g_latest.season=?");
    expect(countSql).toContain("'$.expected_forecasts'");
    expect(countSql).toContain("HAVING COUNT(*)=COALESCE");
    expect(countBinds).toEqual([2027, 2027]);
  });

  it("keeps a newer partial publication behind the latest complete edition", async () => {
    const prepare = vi.fn((sql: string) => ({ bind: vi.fn(() => ({})) }));
    const batch = vi.fn().mockResolvedValue([
      { results: [{ season: 2027 }] },
      { results: [
        { model_id: "partial", forecasts: 1, primary_forecasts: 1, cold_start_forecasts: 0, invalid_forecasts: 0, last_created_at: "2026-09-09T00:00:00Z" },
        { model_id: "complete", forecasts: 12, primary_forecasts: 10, cold_start_forecasts: 2, invalid_forecasts: 0, last_created_at: "2026-09-08T00:00:00Z" },
      ] },
      { results: [
        { model_id: "partial", model_created_at: "2026-09-09T00:00:00Z", target_season: 2027, expected_forecasts: 12 },
        { model_id: "complete", model_created_at: "2026-09-08T00:00:00Z", target_season: 2027, expected_forecasts: 12,
          calibration_games: 5701, margin_half_width: 15.92, fallback_margin_half_width: 23.88, fallback_games: 50,
          evaluation_games: 5734, evaluation_unscored_games: 0, evaluation_winner_accuracy: 0.676,
          evaluation_margin_mae: 10.26, evaluation_margin_rmse: 13.1, evaluation_total_mae: 12.4,
          evaluation_brier: 0.21, evaluation_log_loss: 0.61 },
      ] },
    ]);

    const response = await basketballForecasts.request(
      "/?meta=1&season=2027",
      {},
      { DB: { prepare, batch } },
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { models: Array<Record<string, unknown>> };
    expect(body.models).toMatchObject([
      { model_id: "complete", forecasts: 12, expected_forecasts: 12, publication_complete: true,
        fallback_margin_half_width: 23.88, fallback_games: 50,
        evaluation_unscored_games: 0, evaluation_margin_rmse: 13.1,
        evaluation_total_mae: 12.4, evaluation_brier: 0.21, evaluation_log_loss: 0.61 },
      { model_id: "partial", forecasts: 1, expected_forecasts: 12, publication_complete: false },
    ]);
    const metadataSql = String(prepare.mock.calls.find(([sql]) => String(sql).includes("FROM bb_models"))?.[0]);
    expect(metadataSql).toContain("$.evaluation.brier");
    expect(metadataSql).toContain("$.evaluation.log_loss");
    expect(metadataSql).toContain("$.calibration.fallback_games");
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

  it("uses the published upcoming board when D1 is healthy but empty", async () => {
    const prepare = vi.fn(() => ({
      bind: () => ({ first: async () => ({ total: 0 }) }),
    }));
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      season: 2027,
      generated_at: "2026-09-17T10:00:00Z",
      model: { id: "basketball-efficiency-v2-published" },
      upcoming: [{
        id: "402",
        season: 2027,
        starts_at: "2026-11-03T05:00:00Z",
        home_id: "3",
        away_id: "4",
        home_name: "Home Two",
        away_name: "Away Two",
        completed: 0,
        neutral: 0,
        time_tbd: 1,
        prediction: { home_margin: -2.5, total: 139.5 },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await basketballForecasts.request(
      "/?season=2027&status=upcoming&limit=1",
      {},
      { DB: { prepare }, ASSETS: { fetch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { source: string; total: number; rows: Array<Record<string, unknown>> };
    expect(body).toMatchObject({ source: "published_fallback", total: 1 });
    expect(body.rows[0]).toMatchObject({ game_id: "402", model_id: "basketball-efficiency-v2-published", prediction_integrity: "valid" });
    expect(prepare).toHaveBeenCalledOnce();
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
      version: "basketball-roster-challenger-v2",
      generated_at: "2026-09-17T00:00:00Z",
      primary_model_id: "basketball-efficiency-v2-test",
      coverage: { scenario_games: 1, current_predicted_teams: 2 },
      evaluation: { held_out_transition: 2026, improvement_vs_prior_net: 0.5, mae: 10.4 },
      scenarios: [{
        game_id: "401902275",
        home_id: "2086",
        away_id: "322",
        primary_model_id: "basketball-efficiency-v2-test",
        base_margin: 4.5,
        roster_margin: 5.1,
        margin_delta: 0.6,
        home_predicted_net: 2.1,
        away_predicted_net: -3.4,
        roster_home_win_probability: 0.64,
        roster_margin_low: -10.8,
        roster_margin_high: 21.0,
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await basketballForecasts.request(
      "/?season=2027&status=upcoming&roster=1&limit=1",
      {},
      { DB: { prepare }, ASSETS: { fetch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { roster_model: Record<string, unknown>; roster_alignment: Record<string, unknown>; rows: Array<Record<string, unknown>> };
    expect(body.roster_model).toMatchObject({ version: "basketball-roster-challenger-v2", primary_model_id: "basketball-efficiency-v2-test", scenario_games: 1, improvement_vs_prior_net: 0.5 });
    expect(body.roster_alignment).toEqual({ resolved_model_id: "basketball-efficiency-v2-test", roster_primary_model_id: "basketball-efficiency-v2-test", compatible: true, status: "matched", matched_rows: 1 });
    expect(body.rows[0].roster_lens).toMatchObject({ game_id: "401902275", primary_model_id: "basketball-efficiency-v2-test", roster_margin: 5.1, margin_delta: 0.6, roster_home_win_probability: 0.64, roster_margin_low: -10.8, roster_margin_high: 21 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("withholds a bundled roster lens from a different primary model edition", async () => {
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("SELECT count(*) AS total FROM bb_forecasts")) {
        return { bind: () => ({ first: async () => ({ total: 1 }) }) };
      }
      return { bind: () => ({ all: async () => ({ results: [{
        game_id: "401902275", model_id: "basketball-efficiency-v2-old", created_at: "2026-09-16T00:00:00Z",
        prediction_json: JSON.stringify({ home_margin: 3.5 }), season: 2027,
        starts_at: "2026-11-02T05:00:00Z", home_id: "2086", away_id: "322",
        home_name: "Butler", away_name: "Lafayette", home_score: null, away_score: null,
        completed: 0, neutral: 0, time_tbd: 1, venue: null, broadcast: null,
        source_start: null, source_time_valid: null, source_observed_at: null,
      }] }) }) };
    });
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      version: "basketball-roster-challenger-v2",
      primary_model_id: "basketball-efficiency-v2-current",
      scenarios: [{
        game_id: "401902275", home_id: "2086", away_id: "322",
        primary_model_id: "basketball-efficiency-v2-current", base_margin: 4.5,
        roster_margin: 5.1, margin_delta: 0.6, home_predicted_net: 2.1,
        away_predicted_net: -3.4, roster_home_win_probability: 0.64,
        roster_margin_low: -10.8, roster_margin_high: 21,
      }],
    }), { status: 200 }));
    const response = await basketballForecasts.request(
      "/?season=2027&status=upcoming&model=basketball-efficiency-v2-old&roster=1&limit=1",
      {},
      { DB: { prepare }, ASSETS: { fetch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { roster_alignment: Record<string, unknown>; rows: Array<Record<string, unknown>> };
    expect(body.roster_alignment).toEqual({ resolved_model_id: "basketball-efficiency-v2-old", roster_primary_model_id: null, compatible: false, status: "unavailable", matched_rows: 0 });
    expect(body.rows[0].roster_lens).toBeNull();
  });

  it("reads the roster challenger from the exact D1 model edition", async () => {
    const modelId = "basketball-efficiency-v2-current";
    const forecast = {
      game_id: "401902275", model_id: modelId, created_at: "2026-09-19T00:00:00Z",
      prediction_json: JSON.stringify({ home_margin: 4.5 }), season: 2027,
      starts_at: "2026-11-02T05:00:00Z", home_id: "2086", away_id: "322",
      home_name: "Butler", away_name: "Lafayette", home_score: null, away_score: null,
      completed: 0, neutral: 0, time_tbd: 1, venue: null, broadcast: null,
      source_start: null, source_time_valid: null, source_observed_at: null,
    };
    const lens = {
      game_id: "401902275", home_id: "2086", away_id: "322", primary_model_id: modelId,
      base_margin: 4.5, roster_margin: 5.1, margin_delta: 0.6,
      home_predicted_net: 2.1, away_predicted_net: -3.4,
      roster_home_win_probability: 0.64, roster_margin_low: -10.8, roster_margin_high: 21,
    };
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("SELECT count(*) AS total FROM bb_forecasts")) {
        return { bind: () => ({ first: async () => ({ total: 1 }) }) };
      }
      if (sql.includes("FROM bb_roster_models")) {
        return { bind: () => ({ kind: "roster-model" }) };
      }
      if (sql.includes("FROM bb_roster_scenarios")) {
        return { bind: () => ({ kind: "roster-scenarios" }) };
      }
      return { bind: () => ({ all: async () => ({ results: [forecast] }) }) };
    });
    const batch = vi.fn(async (statements: Array<{ kind?: string }>) => {
      expect(statements.map((statement) => statement.kind)).toEqual(["roster-model", "roster-scenarios"]);
      return [
        { results: [{ metadata_json: JSON.stringify({
          version: "basketball-roster-challenger-v2", generated_at: "2026-09-19T00:00:01Z",
          primary_model_id: modelId, coverage: { scenario_games: 1, current_predicted_teams: 2 },
          evaluation: { held_out_transition: 2026, improvement_vs_prior_net: 0.5, mae: 10.4 },
        }) }] },
        { results: [{ lens_json: JSON.stringify(lens) }] },
      ];
    });
    const fetch = vi.fn();
    const response = await basketballForecasts.request(
      "/?season=2027&status=upcoming&model=latest&roster=1&limit=1",
      {},
      { DB: { prepare, batch }, ASSETS: { fetch } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { roster_model: Record<string, unknown>; roster_alignment: Record<string, unknown>; rows: Array<Record<string, unknown>> };
    expect(body.roster_model).toMatchObject({ primary_model_id: modelId, source: "d1", scenario_games: 1 });
    expect(body.roster_alignment).toEqual({ resolved_model_id: modelId, roster_primary_model_id: modelId, compatible: true, status: "matched", matched_rows: 1 });
    expect(body.rows[0].roster_lens).toMatchObject(lens);
    expect(fetch).not.toHaveBeenCalled();
  });
});
