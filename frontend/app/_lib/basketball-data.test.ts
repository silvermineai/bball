import { describe, expect, it } from "vitest";
import { espnGameUrl, marketComparisonsForLedger } from "./basketball-data";

describe("basketball source links", () => {
  it("builds an encoded ESPN game URL from the source schedule id", () => {
    expect(espnGameUrl("401902275")).toBe(
      "https://www.espn.com/mens-college-basketball/game/_/gameId/401902275",
    );
    expect(espnGameUrl("a/b")).toContain("gameId/a%2Fb");
  });
});

describe("basketball market handoff", () => {
  it("keeps only exact, pre-tip comparisons from eligible games", () => {
    const comparison = {
      provider: "licensed",
      bookmaker: "book",
      market: "spreads" as const,
      captured_at: "2026-11-01T12:00:00Z",
      updated_at: "2026-11-01T11:59:00Z",
      line: -3.5,
      model_difference: 1,
      market_home_probability: null,
    };
    const eligible = {
      id: "v1",
      sport: "basketball" as const,
      game_id: "401",
      model_id: "m",
      generated_at: "2026-11-01T10:00:00Z",
      registered_at: "2026-11-01T10:30:00Z",
      starts_at: "2026-11-01T15:00:00Z",
      time_tbd: 0,
      home_name: "Home",
      away_name: "Away",
      season: 2027,
      home_margin: 3,
      total: 140,
      home_win_probability: 0.6,
      margin_low: 0,
      margin_high: 6,
      status: "scheduled",
      exclusion: null,
      actual_margin: null,
      actual_total: null,
      comparisons: [comparison],
    };
    expect(marketComparisonsForLedger({ games: [eligible] })).toEqual({ "401": [comparison] });
    expect(
      marketComparisonsForLedger({
        games: [{ ...eligible, exclusion: "unconfirmed_start" }, { ...eligible, game_id: "402", comparisons: [{ ...comparison, captured_at: "2026-11-01T16:00:00Z" }] }],
      }),
    ).toEqual({});
  });
});
