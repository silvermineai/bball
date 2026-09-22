import { describe, expect, it } from "vitest";
import type { Game } from "./data";
import { applyLiveFootballMarketComparisons, dashboardFootballMarketComparisons, exactLiveFootballReliability, loadLiveFootballForecasts, loadLiveFootballMarketComparisons, loadLiveFootballModelReliability, mergeLiveFootballForecasts, type LiveFootballForecastRow } from "./live-football-forecasts";

const game = (prediction: Game["prediction"]): Game => ({
  id: "game-1",
  season: 2026,
  kickoff: "2026-09-12T16:00:00Z",
  home_id: "home",
  away_id: "away",
  home_name: "Home",
  away_name: "Away",
  home_conference: "Home Conf",
  away_conference: "Away Conf",
  home_division: "fbs",
  away_division: "fbs",
  week: 2,
  neutral: 0,
  venue: "Stadium",
  time_tbd: 0,
  prediction,
  market: null,
});

const liveRow = (index: number, modelId = "football-v1"): LiveFootballForecastRow => ({
  game_id: `game-${index}`,
  model_id: modelId,
  kickoff: `2026-09-12T${String(index % 24).padStart(2, "0")}:00:00Z`,
  home_id: `home-${index}`,
  away_id: `away-${index}`,
  home_name: `Home ${index}`,
  away_name: `Away ${index}`,
  home_margin: 3,
  total: 48,
  home_win_probability: 0.58,
  home_score: 25.5,
  away_score: 22.5,
  margin_low: -20,
  margin_high: 26,
});

describe("live football forecast merge", () => {
  it("selects reliability bins only from the exact live model edition", () => {
    const reliability = [{ lower: 0.5, upper: 0.6, games: 10, predicted: 0.55, observed: 0.5 }];
    expect(exactLiveFootballReliability({
      models: [
        { model_id: "old-model", model_summary: { evaluation: { reliability: [] } } },
        { model_id: "live-model", model_summary: { evaluation: { reliability } } },
      ],
    }, "live-model")).toEqual({ modelId: "live-model", reliability });
    expect(exactLiveFootballReliability({
      models: [{ model_id: "old-model", model_summary: { evaluation: { reliability } } }],
    }, "live-model")).toEqual({ modelId: "live-model", reliability: null });
  });

  it("loads the exact live model reliability catalog", async () => {
    const originalFetch = globalThis.fetch;
    let requested = "";
    globalThis.fetch = (async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({
        models: [{
          model_id: "live-model",
          model_summary: { evaluation: { reliability: [{ lower: 0.6, upper: 0.7, games: 12, predicted: 0.64, observed: 0.67 }] } },
        }],
      }), { status: 200 });
    }) as typeof fetch;
    await expect(loadLiveFootballModelReliability(undefined, "live-model")).resolves.toMatchObject({
      modelId: "live-model",
      reliability: [{ lower: 0.6, upper: 0.7, games: 12 }],
    });
    expect(requested).toContain("/api/football/research/forecasts?season=2026&meta=1");
    globalThis.fetch = originalFetch;
  });

  it("can limit landing-page refreshes to the first live page", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ total: 250, page_size: 100, rows: [liveRow(0)] }), { status: 200 });
    }) as typeof fetch;
    await expect(loadLiveFootballForecasts(undefined, { maxPages: 1, cacheBust: "cohort-a" })).resolves.toHaveLength(1);
    expect(calls).toBe(1);
    globalThis.fetch = originalFetch;
  });

  it("pins every later page to the model edition returned by page zero", async () => {
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (async (input) => {
      const url = String(input);
      urls.push(url);
      const page = Number(new URL(url, "https://example.test").searchParams.get("page"));
      const count = page < 2 ? 100 : 50;
      const rows = Array.from({ length: count }, (_, offset) => liveRow(page * 100 + offset));
      return new Response(JSON.stringify({ total: 250, page_size: 100, rows }), { status: 200 });
    }) as typeof fetch;
    await expect(loadLiveFootballForecasts(undefined, { cacheBust: "cohort-b" })).resolves.toHaveLength(250);
    expect(urls).toHaveLength(3);
    expect(urls[0]).not.toContain("model=");
    expect(urls.slice(1).every((url) => url.includes("model=football-v1"))).toBe(true);
    expect(urls.every((url) => url.includes("cohort=cohort-b"))).toBe(true);
    globalThis.fetch = originalFetch;
  });

  it("rejects a forecast cohort that changes while pages are loading", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      const page = Number(new URL(String(input), "https://example.test").searchParams.get("page"));
      return new Response(JSON.stringify({
        total: 2,
        page_size: 1,
        rows: [liveRow(page, page === 0 ? "football-v1" : "football-v2")],
      }), { status: 200 });
    }) as typeof fetch;
    await expect(loadLiveFootballForecasts(undefined, { cacheBust: "cohort-c" }))
      .rejects.toThrow("mixed model editions");
    globalThis.fetch = originalFetch;
  });

  it("rejects live rows with an out-of-range probability", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      total: 1,
      page_size: 100,
      rows: [{ ...liveRow(0), home_win_probability: 1.2 }],
    }), { status: 200 })) as typeof fetch;
    await expect(loadLiveFootballForecasts(undefined, { maxPages: 1, cacheBust: "invalid-probability" }))
      .rejects.toThrow("invalid prediction values");
    globalThis.fetch = originalFetch;
  });

  it("rejects live rows whose projected scores contradict the margin", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      total: 1,
      page_size: 100,
      rows: [{ ...liveRow(0), home_margin: 9 }],
    }), { status: 200 })) as typeof fetch;
    await expect(loadLiveFootballForecasts(undefined, { maxPages: 1, cacheBust: "invalid-arithmetic" }))
      .rejects.toThrow("invalid prediction values");
    globalThis.fetch = originalFetch;
  });

  it("indexes exact ledger market comparisons by game", async () => {
    const originalFetch = globalThis.fetch;
    let requested = "";
    globalThis.fetch = (async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({
        live: true,
        season: 2026,
        model: "football-v1",
        total: 1,
        page_size: 5000,
        games: [{ game_id: "game-1", model_id: "football-v1", comparisons: [{ provider: "licensed", bookmaker: "book", market: "spreads", captured_at: "2026-09-10T12:00:00Z", updated_at: "2026-09-10T12:00:00Z", line: -3.5, model_difference: 2, market_home_probability: null }] }],
      }), { status: 200 });
    }) as typeof fetch;
    await expect(loadLiveFootballMarketComparisons(undefined, "football-v1")).resolves.toMatchObject({
      "game-1": { model_id: "football-v1", comparisons: [{ provider: "licensed", market: "spreads", line: -3.5 }] },
    });
    expect(requested).toContain("sport=football&season=2026&model=football-v1&limit=5000");
    globalThis.fetch = originalFetch;
  });

  it("paginates a larger market cohort without weakening edition checks", async () => {
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (async (input) => {
      const url = String(input);
      urls.push(url);
      const page = Number(new URL(url, "https://example.test").searchParams.get("page"));
      return new Response(JSON.stringify({
        live: true,
        season: 2026,
        model: "football-v1",
        total: 2,
        page_size: 1,
        games: [{ game_id: `game-${page + 1}`, model_id: "football-v1", comparisons: [] }],
      }), { status: 200 });
    }) as typeof fetch;
    await expect(loadLiveFootballMarketComparisons(undefined, "football-v1")).resolves.toEqual({
      "game-1": { model_id: "football-v1", comparisons: [] },
      "game-2": { model_id: "football-v1", comparisons: [] },
    });
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("page=0");
    expect(urls[1]).toContain("page=1");
    globalThis.fetch = originalFetch;
  });

  it("rejects a partial live market cohort instead of rendering incomplete evidence", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      live: true,
      season: 2026,
      model: "football-v1",
      total: 2,
      page_size: 5000,
      games: [{ game_id: "game-1", comparisons: [] }],
    }), { status: 200 })) as typeof fetch;
    await expect(loadLiveFootballMarketComparisons(undefined, "football-v1")).rejects.toThrow("incomplete cohort");
    globalThis.fetch = originalFetch;
  });

  it("clears a stale static quote when the live ledger has no qualifying comparison", () => {
    const staticQuote = {
      provider: "archive",
      bookmaker: "book",
      market: "spreads" as const,
      captured_at: "2026-09-01T12:00:00Z",
      updated_at: "2026-09-01T12:00:00Z",
      line: -3.5,
      model_difference: 2,
      market_home_probability: null,
    };
    const published = { ...game(null), market_comparisons: [staticQuote] };
    expect(applyLiveFootballMarketComparisons(published, null).market_comparisons).toEqual([staticQuote]);
    expect(applyLiveFootballMarketComparisons(published, {}).market_comparisons).toEqual([]);
  });

  it("uses static landing evidence only until a complete live market map is available", () => {
    const quote = {
      provider: "archive",
      bookmaker: "book",
      market: "spreads" as const,
      captured_at: "2026-09-01T12:00:00Z",
      updated_at: "2026-09-01T12:00:00Z",
      line: -3.5,
      model_difference: 2,
      market_home_probability: null,
    };
    const published = { ...game(null), market_comparisons: [quote] };
    expect(dashboardFootballMarketComparisons(published, null)).toEqual([quote]);
    expect(dashboardFootballMarketComparisons(published, { "game-1": [] })).toEqual([]);
    expect(dashboardFootballMarketComparisons(published, {})).toEqual([]);
  });

  it("fails closed when a market quote belongs to another model edition", () => {
    const prediction = {
      home_margin: 3,
      total: 48,
      home_score: 25.5,
      away_score: 22.5,
      home_win_probability: 0.58,
      margin_low: -20,
      margin_high: 26,
      model_id: "football-v2",
    };
    const quote = {
      provider: "licensed",
      bookmaker: "book",
      market: "spreads" as const,
      captured_at: "2026-09-10T12:00:00Z",
      updated_at: "2026-09-10T12:00:00Z",
      line: -3.5,
      model_difference: 2,
      market_home_probability: null,
    };
    const comparisons = { "game-1": { model_id: "football-v1", comparisons: [quote] } };
    expect(applyLiveFootballMarketComparisons(game(prediction), comparisons).market_comparisons).toEqual([]);
    expect(applyLiveFootballMarketComparisons(game(prediction), { "game-1": { model_id: "football-v2", comparisons: [quote] } }).market_comparisons).toEqual([quote]);
  });

  it("updates the complete model estimate and retains non-model card evidence", () => {
    const original = {
      home_margin: 3,
      total: 48,
      home_score: 25.5,
      away_score: 22.5,
      home_win_probability: 0.58,
      margin_low: -20,
      margin_high: 26,
    };
    const rows = [{
      game_id: "game-1",
      kickoff: "2026-09-12T17:00:00Z",
      home_id: "home",
      away_id: "away",
      home_name: "Home updated",
      away_name: "Away updated",
      home_margin: 7,
      total: 51,
      home_win_probability: 0.64,
      home_score: 29,
      away_score: 22,
      margin_low: -16,
      margin_high: 30,
      model_id: "football-live-v2",
      created_at: "2026-09-12T14:00:00Z",
    }] satisfies LiveFootballForecastRow[];
    const merged = mergeLiveFootballForecasts([game(original)], rows)[0];
    expect(merged.prediction).toMatchObject({
      home_margin: 7,
      total: 51,
      home_win_probability: 0.64,
      home_score: 29,
      away_score: 22,
      margin_low: -16,
      margin_high: 30,
      model_id: "football-live-v2",
      generated_at: "2026-09-12T14:00:00Z",
    });
    expect(merged.home_name).toBe("Home updated");
  });

  it("publishes a complete live forecast when the static game has no prediction", () => {
    const merged = mergeLiveFootballForecasts([game(null)], [{
      game_id: "game-1",
      kickoff: "2026-09-12T17:00:00Z",
      home_id: "home",
      away_id: "away",
      home_name: "Home updated",
      away_name: "Away updated",
      home_margin: 7,
      total: 51,
      home_win_probability: 0.64,
      home_score: 29,
      away_score: 22,
      margin_low: -16,
      margin_high: 30,
    }]);
    expect(merged[0].prediction).toEqual({
      home_margin: 7,
      total: 51,
      home_win_probability: 0.64,
      home_score: 29,
      away_score: 22,
      margin_low: -16,
      margin_high: 30,
    });
    expect(merged[0].home_name).toBe("Home updated");
  });

  it("does not invent a live forecast when reproducible interval fields are missing", () => {
    const merged = mergeLiveFootballForecasts([game(null)], [{
      game_id: "game-1",
      kickoff: "2026-09-12T17:00:00Z",
      home_id: "home",
      away_id: "away",
      home_name: "Home updated",
      away_name: "Away updated",
      home_margin: 7,
      total: 51,
      home_win_probability: 0.64,
      home_score: 29,
      away_score: 22,
      margin_low: null,
      margin_high: null,
    }]);
    expect(merged[0]).toEqual(game(null));
  });

  it("does not let an invalid live value overwrite a published prediction", () => {
    const published = game({
      home_margin: 3,
      total: 48,
      home_score: 25.5,
      away_score: 22.5,
      home_win_probability: 0.58,
      margin_low: -20,
      margin_high: 26,
    });
    const merged = mergeLiveFootballForecasts([published], [{
      ...liveRow(1),
      game_id: "game-1",
      home_win_probability: 1.4,
      prediction_integrity: "invalid",
    }]);
    expect(merged[0]).toEqual(published);
  });
});
