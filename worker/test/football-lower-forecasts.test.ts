import { describe, expect, it, vi } from "vitest";
import { footballLowerForecasts, parseFootballLowerForecastArtifact } from "../src/football-lower-forecasts";

const season = 2026;
const divisions = ["fcs", "d2", "d3"] as const;

function model(division: string, id = `model-${division}`) {
  return {
    id,
    version: "ridge-division-calibrated-v1",
    division,
    target_season: season,
    cutoff: "2026-09-21T18:56:36.574670Z",
    training_seasons: [2022, 2023, 2024, 2025, 2026],
    training_games: 100,
    calibration_season: 2024,
    calibration: { season: 2024, games: 100, margin_half_width: 20.5 },
    ratings: [],
    limitations: ["Exact-division score model."],
  };
}

function forecast(division: string, id: string, modelId: string) {
  return {
    game_id: id,
    kickoff: "2026-09-24T23:00:00.000Z",
    week: 4,
    scope_division: division,
    home_id: `${id}-home`,
    home_name: `${division.toUpperCase()} Home`,
    away_id: `${id}-away`,
    away_name: `${division.toUpperCase()} Away`,
    neutral: false,
    model_id: modelId,
    prediction: {
      home_margin: 3.2,
      total: 48.4,
      home_score: 25.8,
      away_score: 22.6,
      home_win_probability: 0.61,
      margin_low: -17.3,
      margin_high: 23.7,
    },
  };
}

function artifact() {
  const models = Object.fromEntries(divisions.map((division) => [division, model(division)]));
  const forecasts = Object.fromEntries(divisions.map((division) => [division, [forecast(division, `${division}-game`, `model-${division}`)]]));
  const coverage = Object.fromEntries(divisions.map((division) => [division, { games: 100, score_complete: 100, scores_missing: 0, upcoming_games: 1, forecast_games: 1 }]));
  return {
    schema_version: 2,
    sport: "football",
    season,
    generated_at: "2026-09-21T18:56:36.574670Z",
    coverage,
    models,
    forecasts,
    source: {
      dataset: "schedule",
      season,
      url: "https://data.example/cfb_schedules_2026.csv.gz",
      fetched_at: "2026-09-20T18:52:03.717227Z",
      sha256: "a".repeat(64),
    },
  };
}

function assets(payload = artifact()) {
  return { fetch: vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) };
}

describe("football lower-division forecast publication", () => {
  it("validates all independently fitted division editions", () => {
    const parsed = parseFootballLowerForecastArtifact(artifact(), season);
    expect(parsed?.forecasts.d2).toHaveLength(1);
    expect(parsed?.models.fcs.id).toBe("model-fcs");
    expect(parseFootballLowerForecastArtifact({ ...artifact(), season: 2027 }, season)).toBeNull();
  });

  it("serves filtered, paginated forecasts without mixing divisions", async () => {
    const response = await footballLowerForecasts.request(
      "/?division=d2&gameId=d2-game&q=d2%20home&page=0&limit=1",
      {},
      { ASSETS: assets() },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, any>;
    expect(body).toMatchObject({ season, division: "d2", status: "upcoming", total: 1 });
    expect(body.rows[0]).toMatchObject({ scope_division: "d2", model_id: "model-d2" });
    expect(body.rows[0].prediction.home_win_probability).toBe(0.61);
  });

  it("exposes bounded model and coverage metadata", async () => {
    const response = await footballLowerForecasts.request("/?meta=1", {}, { ASSETS: assets() });
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, any>;
    expect(body.available_divisions).toEqual(["fcs", "d2", "d3"]);
    expect(body.models.d3).toMatchObject({ model_id: "model-d3", training_games: 100, forecast_rows: 1 });
    expect(body.integrity).toEqual({ divisions: 3, forecast_rows: 3, valid_rows: 3 });
  });

  it("fails closed when a forecast row is tampered with", async () => {
    const bad = artifact();
    (bad.forecasts.d3[0] as any).prediction.home_win_probability = 1.4;
    expect((await footballLowerForecasts.request("/?division=d3", {}, { ASSETS: assets(bad) })).status).toBe(503);
  });

  it("does not invent completed rows and rejects unbounded input", async () => {
    const completed = await footballLowerForecasts.request("/?status=completed", {}, { ASSETS: assets() });
    expect(completed.status).toBe(200);
    await expect(completed.json()).resolves.toMatchObject({ total: 0, rows: [] });
    const assetsMock = assets();
    for (const path of ["/?season=2020", "/?limit=101", "/?page=-1", "/?division=naia", "/?gameId=bad%2Fid"]) {
      expect((await footballLowerForecasts.request(path, {}, { ASSETS: assetsMock })).status).toBe(400);
    }
    expect(assetsMock.fetch).not.toHaveBeenCalled();
  });
});
