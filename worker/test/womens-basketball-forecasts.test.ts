import { describe, expect, it, vi } from "vitest";
import { parseWomensForecastArtifact, validWomensPredictionArithmetic, womensBasketballForecasts } from "../src/womens-basketball-forecasts";

const prediction = {
  home_win_probability: 0.64,
  away_win_probability: 0.36,
  predicted_margin: 4.2,
  predicted_home_score: 72.1,
  predicted_away_score: 67.9,
  margin_low: -9.8,
  margin_high: 18.2,
  estimate_type: "primary",
  home_training_games: 30,
  away_training_games: 29,
};

const artifact = {
  schema_version: 1,
  model_id: "womens-basketball-margin-v3-test",
  sport: "basketball",
  gender: "women",
  target_season: 2027,
  generated_at: "2026-09-20T09:15:12Z",
  model_status: "published",
  method: "women-only test model",
  training_seasons: [2023, 2024, 2025],
  validation_season: 2026,
  validation: { games: 5897, brier_score: 0.2023 },
  calibration: { games: 17000, logistic_coefficients: [0, 0.1] },
  home_advantage: 3.4,
  coverage: { forecast_rows: 2, primary_rows: 2, cold_start_rows: 0 },
  market_comparison: { status: "awaiting_qualified_capture" },
  receipts: { team_box_2025: { sha256: "abc", url: "https://outside.example/source" } },
  limitations: ["women-only"],
  forecasts: [
    { game_id: "1001", date: "2026-11-01", home_id: "10", away_id: "20", home: "Home Women", away: "Away Women", prediction },
    { game_id: "1002", date: "2026-11-02", home_id: "30", away_id: "40", home: "Other Home", away: "Other Away", prediction: { ...prediction, home_win_probability: 0.51, away_win_probability: 0.49 } },
    { game_id: "1003", date: "2026-11-03", home_id: "50", away_id: "60", home: "Bad Row", away: "Bad Away", prediction: { ...prediction, home_win_probability: 1.2 } },
  ],
};

function assets() {
  return { fetch: vi.fn(async () => new Response(JSON.stringify(artifact), { status: 200 })) };
}

describe("women's basketball forecast publication", () => {
  it("keeps score and margin arithmetic internally consistent", () => {
    expect(validWomensPredictionArithmetic(prediction)).toBe(true);
    expect(validWomensPredictionArithmetic({ ...prediction, predicted_margin: 12 })).toBe(false);
    expect(validWomensPredictionArithmetic({ ...prediction, predicted_home_score: -1 })).toBe(false);
    const parsed = parseWomensForecastArtifact({
      ...artifact,
      forecasts: artifact.forecasts.map((row, index) => index === 0
        ? { ...row, prediction: { ...row.prediction, predicted_margin: 12 } }
        : row),
    });
    expect(parsed.forecasts).toHaveLength(1);
    expect(parsed.invalid_rows).toBe(2);
  });

  it("requires the source-native women artifact and counts malformed rows", () => {
    const parsed = parseWomensForecastArtifact(artifact);
    expect(parsed.forecasts).toHaveLength(2);
    expect(parsed.invalid_rows).toBe(1);
    expect(parseWomensForecastArtifact({ ...artifact, gender: "men" }).artifact).toBeNull();
  });

  it("serves paginated upcoming forecasts without leaking receipt URLs", async () => {
    const response = await womensBasketballForecasts.request(
      "/?season=2027&status=upcoming&q=other&page=0&limit=1",
      {},
      { ASSETS: assets() },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, any>;
    expect(body).toMatchObject({ season: 2027, status: "upcoming", total: 1, model_id: artifact.model_id });
    expect(body.rows[0]).toMatchObject({ game_id: "1002", home_name: "Other Home", prediction_integrity: "valid" });
    expect(body.integrity).toEqual({ source_rows: 3, invalid_rows: 1 });
    expect(body.rows[0].prediction.home_win_probability).toBe(0.51);
  });

  it("exposes model and held-out metadata through a bounded catalog read", async () => {
    const response = await womensBasketballForecasts.request("/?season=2027&meta=1", {}, { ASSETS: assets() });
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, any>;
    expect(body.model).toMatchObject({
      model_id: artifact.model_id,
      gender: "women",
      validation: artifact.validation,
      integrity: { source_rows: 3, valid_rows: 2, invalid_rows: 1 },
      receipts: [{ dataset: "team_box_2025", sha256: "abc" }],
    });
    expect(body.model.receipts[0]).not.toHaveProperty("url");
  });

  it("does not invent completed WBB rows", async () => {
    const response = await womensBasketballForecasts.request("/?season=2027&status=completed", {}, { ASSETS: assets() });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ total: 0, rows: [], source: "published_asset" });
  });

  it("rejects unbounded or malformed query values", async () => {
    const assetsMock = assets();
    for (const path of ["/?season=2020", "/?limit=101", "/?page=-1", "/?gameId=not-an-id"]) {
      expect((await womensBasketballForecasts.request(path, {}, { ASSETS: assetsMock })).status).toBe(400);
    }
    expect(assetsMock.fetch).not.toHaveBeenCalled();
  });
});
