import { describe, expect, it } from "vitest";
import type { BBGame } from "./basketball-types";
import { mergeLiveBasketballForecasts, type LiveForecastRow } from "./live-basketball-forecasts";

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
  it("replaces current predictions while preserving static evidence and unforecasted games", () => {
    const staticGames = [
      game("a", "2026-11-02T05:00:00Z", prediction(4)),
      game("b", "2026-11-03T05:00:00Z", null),
    ];
    const rows = [{
      game_id: "a",
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
      prediction: prediction(9),
    }] satisfies LiveForecastRow[];

    const merged = mergeLiveBasketballForecasts(staticGames, rows);
    expect(merged.map((item) => item.id)).toEqual(["a", "b"]);
    expect(merged[0].prediction?.home_margin).toBe(9);
    expect(merged[0].venue).toBe("Updated venue");
    expect(merged[1].prediction).toBeNull();
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
});
