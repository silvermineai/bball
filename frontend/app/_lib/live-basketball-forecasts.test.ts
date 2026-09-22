import { describe, expect, it, vi } from "vitest";
import type { BBGame } from "./basketball-types";
import { forecastModelId, liveMarketComparisonStatus, loadLiveBasketballForecasts, loadLiveBasketballGameMarketComparison, loadLiveBasketballMarketComparisons, matchingRosterScenario, mergeLiveBasketballForecasts, mergeLiveForecast, publishedBasketballPrediction, type LiveForecastRow } from "./live-basketball-forecasts";

const prediction = (margin: number) => ({
  home_score: 70 + margin,
  away_score: 70,
  home_margin: margin,
  total: 140 + margin,
  pace: 68,
  home_win_probability: 0.5,
  margin_low: margin - 10,
  margin_high: margin + 10,
});

const game = (id: string, starts_at: string, current: BBGame["prediction"]): BBGame => ({
  id,
  season: 2027,
  starts_at,
  home_id: `${id}-home`,
  away_id: `${id}-away`,
  home_name: `Home ${id}`,
  away_name: `Away ${id}`,
  neutral: 0,
  time_tbd: 1,
  venue: `Venue ${id}`,
  broadcast: "",
  prediction: current,
  fallback_prediction: null,
  matchup_factors: null,
});

describe("live basketball forecast merge", () => {
  it("withholds the market status until a forecast edition is verified", () => {
    expect(liveMarketComparisonStatus({ modelId: null, forecastReady: false, comparisons: null })).toBe("checking_forecast");
    expect(liveMarketComparisonStatus({ modelId: null, forecastReady: true, comparisons: null })).toBe("unavailable");
    expect(liveMarketComparisonStatus({ modelId: "model-a", forecastReady: true, comparisons: null })).toBe("checking_market");
    expect(liveMarketComparisonStatus({ modelId: "model-a", forecastReady: true, comparisons: {} })).toBe("ready");
    expect(liveMarketComparisonStatus({ modelId: "model-a", forecastReady: true, marketError: "read failed", comparisons: null })).toBe("unavailable");
  });

  it("requests a selected stored model edition without changing the endpoint contract", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ total: 0, page_size: 100, rows: [] }),
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(loadLiveBasketballForecasts(undefined, { maxPages: 1, model: "edition/unsafe?value", cacheBust: "test" })).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/basketball/research/forecasts?season=2027&status=upcoming&limit=100&page=0&model=edition%2Funsafe%3Fvalue&cohort=test",
      { signal: undefined },
    );
    vi.unstubAllGlobals();
  });

  it("bounds a live lookup to the requested program when a query is supplied", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ total: 0, page_size: 100, rows: [] }),
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(loadLiveBasketballForecasts(undefined, { maxPages: 1, query: "  Duke  ", cacheBust: "test" })).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/basketball/research/forecasts?season=2027&status=upcoming&limit=100&page=0&q=Duke&cohort=test",
      { signal: undefined },
    );
    vi.unstubAllGlobals();
  });

  it("loads the complete registered forecast edition by default", async () => {
    const row = (id: string): LiveForecastRow => ({
      game_id: id,
      model_id: "model-a",
      season: 2027,
      starts_at: "2026-11-01T05:00:00Z",
      home_id: `${id}-home`,
      away_id: `${id}-away`,
      home_name: `Home ${id}`,
      away_name: `Away ${id}`,
      neutral: 0,
      time_tbd: 1,
      venue: null,
      broadcast: null,
      prediction: prediction(1),
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 3, page_size: 1, rows: [row("one")] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 3, page_size: 1, rows: [row("two")] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 3, page_size: 1, rows: [row("three")] }) });
    vi.stubGlobal("fetch", fetcher);
    await expect(loadLiveBasketballForecasts(undefined, { cacheBust: "test" })).resolves.toHaveLength(3);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/basketball/research/forecasts?season=2027&status=upcoming&limit=100&page=2&model=model-a&cohort=test",
      { signal: undefined },
    );
    vi.unstubAllGlobals();
  });

  it("fails closed when a later page changes the cohort metadata", async () => {
    const row = (id: string): LiveForecastRow => ({
      game_id: id,
      season: 2027,
      starts_at: "2026-11-01T05:00:00Z",
      home_id: `${id}-home`,
      away_id: `${id}-away`,
      home_name: `Home ${id}`,
      away_name: `Away ${id}`,
      neutral: 0,
      time_tbd: 1,
      venue: null,
      broadcast: null,
      prediction: prediction(1),
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 2, page_size: 1, rows: [row("one")] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 3, page_size: 1, rows: [row("two")] }) });
    vi.stubGlobal("fetch", fetcher);
    await expect(loadLiveBasketballForecasts(undefined, { cacheBust: "test" })).rejects.toThrow("changed during pagination");
    vi.unstubAllGlobals();
  });

  it("fails closed when an unlabeled first page hides mixed later model editions", async () => {
    const row = (id: string, model_id?: string): LiveForecastRow => ({
      game_id: id,
      model_id,
      season: 2027,
      starts_at: "2026-11-01T05:00:00Z",
      home_id: `${id}-home`,
      away_id: `${id}-away`,
      home_name: `Home ${id}`,
      away_name: `Away ${id}`,
      neutral: 0,
      time_tbd: 1,
      venue: null,
      broadcast: null,
      prediction: prediction(1),
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 3, page_size: 1, rows: [row("one")] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 3, page_size: 1, rows: [row("two", "model-a")] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 3, page_size: 1, rows: [row("three", "model-b")] }) });
    vi.stubGlobal("fetch", fetcher);
    await expect(loadLiveBasketballForecasts(undefined, { cacheBust: "test" })).rejects.toThrow("mixed model editions");
    vi.unstubAllGlobals();
  });

  it("fails closed when a nonempty forecast cohort has no edition labels", async () => {
    const row: LiveForecastRow = {
      game_id: "unlabeled",
      season: 2027,
      starts_at: "2026-11-01T05:00:00Z",
      home_id: "home",
      away_id: "away",
      home_name: "Home",
      away_name: "Away",
      neutral: 0,
      time_tbd: 1,
      venue: null,
      broadcast: null,
      prediction: prediction(1),
    };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ total: 1, page_size: 100, rows: [row] }),
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(loadLiveBasketballForecasts(undefined, { cacheBust: "test" })).rejects.toThrow("unlabeled model edition");
    vi.unstubAllGlobals();
  });

  it("fails closed on duplicate game IDs in a complete cohort", async () => {
    const row: LiveForecastRow = {
      game_id: "duplicate",
      season: 2027,
      starts_at: "2026-11-01T05:00:00Z",
      home_id: "home",
      away_id: "away",
      home_name: "Home",
      away_name: "Away",
      neutral: 0,
      time_tbd: 1,
      venue: null,
      broadcast: null,
      prediction: prediction(1),
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 2, page_size: 1, rows: [row] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 2, page_size: 1, rows: [row] }) });
    vi.stubGlobal("fetch", fetcher);
    await expect(loadLiveBasketballForecasts(undefined, { cacheBust: "test" })).rejects.toThrow("duplicate games");
    vi.unstubAllGlobals();
  });

  it("retries a transient forecast response with a bounded cache-busting query", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 0, page_size: 100, rows: [] }) });
    vi.stubGlobal("fetch", fetcher);
    await expect(loadLiveBasketballForecasts(undefined, { maxPages: 1, cacheBust: "test" })).resolves.toEqual([]);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/basketball/research/forecasts?season=2027&status=upcoming&limit=100&page=0&cohort=test",
      { signal: undefined },
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/basketball/research/forecasts?season=2027&status=upcoming&limit=100&page=0&cohort=test&retry=1",
      { signal: undefined },
    );
    vi.unstubAllGlobals();
  });

  it("resolves one forecast edition and pins scorecard comparisons to it", async () => {
    expect(forecastModelId([{ model_id: "model-a" }, { model_id: "model-a" }])).toBe("model-a");
    expect(forecastModelId([{ model_id: "model-a" }, { model_id: "model-b" }])).toBeNull();
    expect(forecastModelId([{ model_id: undefined }])).toBeNull();
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ games: [
        { game_id: "g1", model_id: "model-a", comparisons: [{ provider: "test", bookmaker: "book", market: "h2h" }] },
        { game_id: "g2", model_id: "model-b", comparisons: [{ provider: "wrong", bookmaker: "wrong", market: "h2h" }] },
        { game_id: "g3", model_id: "model-a" },
      ] }),
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(loadLiveBasketballMarketComparisons(undefined, "model-a")).resolves.toEqual({
      g1: [{ provider: "test", bookmaker: "book", market: "h2h" }],
      g3: [],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/research/scorecard?sport=basketball&model=model-a&limit=5000",
      { signal: undefined },
    );
    await expect(loadLiveBasketballMarketComparisons(undefined, null)).resolves.toEqual({});
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("pins a brief market lookup to the exact game's live forecast edition", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rows: [{ game_id: "g1", model_id: "model-live", created_at: "2026-09-20T12:00:00Z", starts_at: "2026-09-20T16:00:00Z" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ games: [
          { game_id: "g1", model_id: "wrong-model", comparisons: [{ provider: "wrong", bookmaker: "wrong", market: "spreads" }] },
          { game_id: "g1", model_id: "model-live", comparisons: [{ provider: "feed", bookmaker: "book", market: "spreads", captured_at: "2026-09-20T13:00:00Z", updated_at: "2026-09-20T13:00:00Z", line: -2.5, model_difference: 1.2, market_home_probability: null }] },
        ] }),
      });
    vi.stubGlobal("fetch", fetcher);
    await expect(loadLiveBasketballGameMarketComparison(undefined, "g1")).resolves.toEqual({
      modelId: "model-live",
      forecastCreatedAt: "2026-09-20T12:00:00Z",
      forecastStartsAt: "2026-09-20T16:00:00Z",
      comparisons: [{ provider: "feed", bookmaker: "book", market: "spreads", captured_at: "2026-09-20T13:00:00Z", updated_at: "2026-09-20T13:00:00Z", line: -2.5, model_difference: 1.2, market_home_probability: null }],
    });
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/basketball/research/forecasts?season=2027&gameId=g1&model=latest&status=all&limit=1", { signal: undefined });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/research/scorecard?sport=basketball&model=model-live&limit=5000", { signal: undefined });
    vi.unstubAllGlobals();
  });

  it("withholds a brief market result when the exact forecast has no immutable edition", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [{ game_id: "g1" }] }) });
    vi.stubGlobal("fetch", fetcher);
    await expect(loadLiveBasketballGameMarketComparison(undefined, "g1")).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("replaces current predictions while preserving static evidence and unforecasted games", () => {
    const staticGames = [
      game("a", "2026-11-02T05:00:00Z", prediction(4)),
      game("b", "2026-11-03T05:00:00Z", null),
    ];
    const rows = [{
      game_id: "a",
      model_id: "model-new",
      created_at: "2026-09-10T12:00:00Z",
      season: 2027,
      starts_at: "2026-11-02T06:00:00Z",
      home_id: "a-home",
      away_id: "a-away",
      home_name: "Home a",
      away_name: "Away a",
      neutral: 0,
      time_tbd: 0,
      venue: "Updated venue",
      broadcast: "ESPN",
      source_start: "2026-11-02T06:00:00Z",
      source_time_valid: true,
      source_observed_at: "2026-09-10T00:00:00Z",
      prediction: prediction(9),
    }] satisfies LiveForecastRow[];

    const merged = mergeLiveBasketballForecasts(staticGames, rows);
    expect(merged.map((item) => item.id)).toEqual(["a", "b"]);
    expect(merged[0].prediction?.home_margin).toBe(9);
    expect(merged[0].forecast_model_id).toBe("model-new");
    expect(merged[0].forecast_created_at).toBe("2026-09-10T12:00:00Z");
    expect(merged[0].venue).toBe("Updated venue");
    expect(merged[0].source_start).toBe("2026-11-02T06:00:00Z");
    expect(merged[0].source_time_valid).toBe(true);
    expect(merged[1].prediction).toBeNull();
  });

  it("keeps featured-card factors on the live forecast edition", () => {
    const staticFactors: NonNullable<BBGame["matchup_factors"]> = {
      season: 2026,
      factors: {},
      edges: { efg: 0.01 },
    };
    const liveFactors: NonNullable<BBGame["matchup_factors"]> = {
      season: 2026,
      factors: {},
      edges: { efg: -0.04 },
    };
    const staticGame = {
      ...game("featured", "2026-11-02T05:00:00Z", prediction(4)),
      forecast_model_id: "model-old",
      matchup_factors: staticFactors,
      matchup_factors_model_id: "model-old",
      matchup_factors_same_edition: true,
    };
    const liveRow = {
      game_id: "featured",
      model_id: "model-live",
      created_at: "2026-09-21T12:00:00Z",
      season: 2027,
      starts_at: "2026-11-02T05:00:00Z",
      home_id: "featured-home",
      away_id: "featured-away",
      home_name: "Home featured",
      away_name: "Away featured",
      neutral: 0,
      time_tbd: 1,
      venue: null,
      broadcast: null,
      prediction: prediction(8),
      matchup_factors: liveFactors,
      matchup_factors_model_id: "model-live",
    } satisfies LiveForecastRow;
    const merged = mergeLiveForecast(staticGame, liveRow);
    expect(merged.matchup_factors).toEqual(liveFactors);
    expect(merged.matchup_factors_model_id).toBe("model-live");
    expect(merged.matchup_factors_generated_at).toBe("2026-09-21T12:00:00Z");
    expect(merged.matchup_factors_same_edition).toBe(true);

    const withoutLiveFactors = mergeLiveForecast(staticGame, { ...liveRow, matchup_factors: undefined, matchup_factors_model_id: undefined });
    expect(withoutLiveFactors.matchup_factors).toBeNull();
    expect(withoutLiveFactors.matchup_factors_same_edition).toBeNull();
  });

  it("carries Four Factor context only with its exact live forecast edition", () => {
    const factors: NonNullable<BBGame["matchup_factors"]> = {
      season: 2026,
      factors: {
        efg: { home_offense: 0.53, home_defense: 0.50, away_offense: 0.49, away_defense: 0.52 },
        tov: { home_offense: 0.16, home_defense: 0.15, away_offense: 0.17, away_defense: 0.16 },
        orb: { home_offense: 0.30, home_defense: 0.28, away_offense: 0.25, away_defense: 0.30 },
        ftr: { home_offense: 0.38, home_defense: 0.26, away_offense: 0.31, away_defense: 0.32 },
      },
      edges: { efg: 0.02, tov: 0.01, orb: 0.03, ftr: -0.01 },
    };
    const staticGame = { ...game("factor", "2026-11-02T05:00:00Z", prediction(4)), matchup_factors: factors };
    const row = {
      game_id: "factor",
      model_id: "model-live",
      season: 2027,
      starts_at: "2026-11-02T05:00:00Z",
      home_id: "factor-home",
      away_id: "factor-away",
      home_name: "Home factor",
      away_name: "Away factor",
      neutral: 0,
      time_tbd: 1,
      venue: null,
      broadcast: null,
      prediction: prediction(5),
      matchup_factors: factors,
      matchup_factors_model_id: "model-live",
    } satisfies LiveForecastRow;

    const live = mergeLiveBasketballForecasts([staticGame], [row], "model-static");
    expect(live[0].matchup_factors).toEqual(factors);

    const mismatched = mergeLiveBasketballForecasts([staticGame], [{
      ...row,
      matchup_factors_model_id: "model-old",
    }], "model-static");
    expect(mismatched[0].matchup_factors).toEqual(factors);
    expect(mismatched[0].matchup_factors_model_id).toBe("model-old");
    expect(mismatched[0].matchup_factors_same_edition).toBe(false);

    const sameStaticEdition = mergeLiveBasketballForecasts([staticGame], [{
      ...row,
      matchup_factors: undefined,
      matchup_factors_model_id: undefined,
      model_id: "model-static",
    }], "model-static");
    expect(sameStaticEdition[0].matchup_factors).toEqual(factors);
    expect(sameStaticEdition[0].matchup_factors_model_id).toBe("model-static");
    expect(sameStaticEdition[0].matchup_factors_same_edition).toBe(true);
  });

  it("adds a newly registered game and orders the complete slate by start time", () => {
    const rows = [{
      game_id: "new",
      season: 2027,
      starts_at: "2026-11-01T05:00:00Z",
      home_id: "new-home",
      away_id: "new-away",
      home_name: "New home",
      away_name: "New away",
      neutral: 1,
      time_tbd: 1,
      venue: null,
      broadcast: null,
      prediction: prediction(2),
    }] satisfies LiveForecastRow[];
    const merged = mergeLiveBasketballForecasts([game("old", "2026-11-02T05:00:00Z", null)], rows);
    expect(merged.map((item) => item.id)).toEqual(["new", "old"]);
    expect(merged[0].home_name).toBe("New home");
  });

  it("keeps a live cold-start row labeled as a fallback estimate", () => {
    const cold = { ...prediction(-3), estimate_type: "cold_start" as const };
    const rows = [{
      game_id: "cold",
      season: 2027,
      starts_at: "2026-11-04T05:00:00Z",
      home_id: "cold-home",
      away_id: "cold-away",
      home_name: "Cold home",
      away_name: "Cold away",
      neutral: 0,
      time_tbd: 1,
      venue: null,
      broadcast: null,
      prediction: cold,
    }] satisfies LiveForecastRow[];
    const merged = mergeLiveBasketballForecasts([game("cold", "2026-11-04T05:00:00Z", null)], rows);
    expect(merged[0].prediction).toBeNull();
    expect(merged[0].fallback_prediction?.estimate_type).toBe("cold_start");
    expect(publishedBasketballPrediction(merged[0])).toBe(merged[0].fallback_prediction);
  });

  it("selects the published primary estimate before fallback and excludes empty games", () => {
    const primary = prediction(4);
    const fallback = { ...prediction(-3), estimate_type: "cold_start" as const };
    expect(publishedBasketballPrediction({ prediction: primary, fallback_prediction: fallback })).toBe(primary);
    expect(publishedBasketballPrediction({ prediction: null, fallback_prediction: fallback })).toBe(fallback);
    expect(publishedBasketballPrediction({ prediction: null, fallback_prediction: null })).toBeNull();
  });

  it("withholds a roster scenario calibrated against another forecast edition", () => {
    const scenario = {
      game_id: "a",
      home_id: "a-home",
      away_id: "a-away",
      primary_model_id: "model-static",
      base_margin: 4,
      roster_margin: 5,
      margin_delta: 1,
      home_predicted_net: 10,
      away_predicted_net: 5,
      roster_home_win_probability: 0.64,
      roster_margin_low: -6,
      roster_margin_high: 16,
    };
    expect(matchingRosterScenario({}, scenario, "model-static")).toBe(scenario);
    expect(matchingRosterScenario({ forecast_model_id: "model-live" }, scenario, "model-static")).toBeNull();
    expect(matchingRosterScenario({ forecast_model_id: "model-static" }, scenario, "model-live")).toBe(scenario);
  });
});
