import { describe, expect, it } from "vitest";
import type { BBGame, BBRosterScenario } from "../_lib/basketball-types";
import { recruitingGamePlayerEvidence, recruitingGamePlayerHref, selectRecruitingGameLenses } from "./recruiting-game-lens";

const game = (overrides: Partial<BBGame> = {}): BBGame => ({
  id: "g-1",
  season: 2027,
  starts_at: "2026-11-01T00:00:00Z",
  home_id: "home-1",
  away_id: "away-1",
  home_name: "Home",
  away_name: "Away",
  neutral: 0,
  time_tbd: 0,
  venue: "Home",
  broadcast: "",
  prediction: {
    home_score: 75,
    away_score: 70,
    home_margin: 5,
    total: 145,
    pace: 68,
    home_win_probability: 0.65,
    margin_low: -3,
    margin_high: 13,
  },
  ...overrides,
});

const scenario = (overrides: Partial<BBRosterScenario> = {}): BBRosterScenario => ({
  game_id: "g-1",
  home_id: "home-1",
  away_id: "away-1",
  primary_model_id: "model-1",
  base_margin: 5,
  roster_margin: 8,
  margin_delta: 3,
  home_predicted_net: 1,
  away_predicted_net: -1,
  roster_home_win_probability: 0.7,
  roster_margin_low: -1,
  roster_margin_high: 17,
  ...overrides,
});

describe("recruiting game player links", () => {
  it("preserves the exact athlete ID and prior season in the player archive URL", () => {
    expect(recruitingGamePlayerHref("a/b", 2026)).toBe("/basketball/ncaa-player/?id=a%2Fb&season=2026");
  });

  it("shows prior workload, observed BPM and exact-ID continuity without filling missing values", () => {
    expect(recruitingGamePlayerEvidence({ athlete_id: "a", name: "Player", prior_minutes: 812.5, bpm: 3.2, returning: true, represented: true, weighted_bpm_minutes: 2600 })).toBe("813 prior min · 3.2 BPM · Returning · exact roster match");
    expect(recruitingGamePlayerEvidence({ athlete_id: "b", name: "Player", prior_minutes: 500, bpm: null, returning: false, represented: false, weighted_bpm_minutes: null })).toBe("500 prior min · — BPM · No current roster match");
  });
});

describe("selectRecruitingGameLenses", () => {
  it("keeps only exact same-edition game and team joins, ordered by disagreement", () => {
    const rows = selectRecruitingGameLenses(
      [
        game(),
        game({ id: "g-2", starts_at: "2026-11-02T00:00:00Z", home_id: "home-2", away_id: "away-2" }),
        game({ id: "g-3", starts_at: "2026-11-03T00:00:00Z" }),
      ],
      { primary_model_id: "model-1" },
      [
        scenario({ margin_delta: 3 }),
        scenario({ game_id: "g-2", home_id: "home-2", away_id: "away-2", margin_delta: -9 }),
        scenario({ game_id: "g-3", primary_model_id: "old-model", margin_delta: 20 }),
        scenario({ game_id: "g-3", home_id: "wrong-home", margin_delta: 30 }),
      ],
    );
    expect(rows.map((row) => row.game.id)).toEqual(["g-2", "g-1"]);
  });

  it("withholds games without forecasts or valid numeric scenario margins", () => {
    expect(selectRecruitingGameLenses(
      [game({ id: "no-prediction", prediction: null })],
      { primary_model_id: "model-1" },
      [scenario({ game_id: "no-prediction", margin_delta: Number.NaN })],
    )).toEqual([]);
    expect(selectRecruitingGameLenses([game()], { primary_model_id: "model-1" }, [scenario()], 0)).toEqual([]);
  });
});
