import { describe, expect, it } from "vitest";
import type { Game } from "./data";
import { loadLiveFootballMarketComparisons, mergeLiveFootballForecasts, type LiveFootballForecastRow } from "./live-football-forecasts";

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

describe("live football forecast merge", () => {
  it("indexes exact ledger market comparisons by game", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      games: [{ game_id: "game-1", comparisons: [{ provider: "licensed", bookmaker: "book", market: "spreads", captured_at: "2026-09-10T12:00:00Z", updated_at: "2026-09-10T12:00:00Z", line: -3.5, model_difference: 2, market_home_probability: null }] }],
    }), { status: 200 })) as typeof fetch;
    await expect(loadLiveFootballMarketComparisons()).resolves.toMatchObject({
      "game-1": [{ provider: "licensed", market: "spreads", line: -3.5 }],
    });
    globalThis.fetch = originalFetch;
  });

  it("updates only the model values and retains the static card evidence", () => {
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
    }] satisfies LiveFootballForecastRow[];
    const merged = mergeLiveFootballForecasts([game(original)], rows)[0];
    expect(merged.prediction).toMatchObject({
      home_margin: 7,
      total: 51,
      home_win_probability: 0.64,
      margin_low: -20,
      margin_high: 26,
    });
    expect(merged.home_name).toBe("Home updated");
  });

  it("leaves games without a static prediction unchanged", () => {
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
    }]);
    expect(merged[0].prediction).toBeNull();
    expect(merged[0].home_name).toBe("Home");
  });
});
