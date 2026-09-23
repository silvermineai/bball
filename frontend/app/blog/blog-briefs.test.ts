import { describe, expect, it } from "vitest";
import type { BBGame } from "../_lib/basketball-types";
import { basketballBlogHref, publishedBasketballBlogGames } from "./blog-briefs";

const baseGame = (id: string): BBGame => ({
  id,
  season: 2027,
  starts_at: "2026-11-01T19:00:00Z",
  home_id: "home",
  away_id: "away",
  home_name: "Home College",
  away_name: "Away College",
  neutral: 0,
  time_tbd: 0,
  venue: "Arena",
  broadcast: "",
  prediction: null,
  fallback_prediction: null,
});

describe("basketball blog matchup index", () => {
  it("keeps only games with a published primary or fallback estimate", () => {
    const primary = {
      ...baseGame("primary"),
      prediction: { home_score: 75, away_score: 70, home_margin: 5, total: 145, pace: 70, home_win_probability: 0.65, margin_low: -4, margin_high: 14 },
    };
    const fallback = {
      ...baseGame("fallback"),
      fallback_prediction: { home_score: 72, away_score: 71, home_margin: 1, total: 143, pace: 68, home_win_probability: 0.52, margin_low: -14, margin_high: 16, estimate_type: "cold_start" as const },
    };

    expect(publishedBasketballBlogGames([baseGame("unavailable"), primary, fallback]).map((game) => game.id)).toEqual(["primary", "fallback"]);
  });

  it("uses the exact basketball notebook route and safely encodes IDs", () => {
    expect(basketballBlogHref("401/900?edition=1")).toBe("/blog/basketball-game-401%2F900%3Fedition%3D1/");
  });
});
