import { describe, expect, it } from "vitest";
import type { BBGame, BBTeam } from "./basketball-types";
import { selectBasketballWatchlist } from "./basketball-watchlist";

const game = (id: string, margin: number, low = -10, high = 10): BBGame => ({
  id,
  season: 2027,
  starts_at: "2026-11-" + id.padStart(2, "0") + "T20:00:00Z",
  home_id: id,
  away_id: id + "-away",
  home_name: "Home " + id,
  away_name: "Away " + id,
  neutral: 0,
  time_tbd: 0,
  venue: "",
  broadcast: "",
  prediction: {
    home_score: 70,
    away_score: 70 - margin,
    home_margin: margin,
    total: 140 - margin,
    pace: 68,
    home_win_probability: 0.5,
    margin_low: low,
    margin_high: high,
  },
});

const team = (id: string, rank: number): BBTeam => ({
  id,
  name: id,
  rank,
  adj_off: 110,
  adj_def: 95,
  adj_net: 15,
  adj_tempo: 68,
  games: 30,
  wins: 20,
  expected_wins: null,
  luck: null,
  luck_games: 0,
  sos: null,
  sos_games: 0,
  efg: null,
  tov_rate: null,
  orb_rate: null,
  ft_rate: null,
  three_rate: null,
});

describe("basketball editorial watchlist", () => {
  it("prioritizes a close stored margin and labels the reason", () => {
    const rows = selectBasketballWatchlist(
      [game("1", 2), game("2", 12)],
      [team("1", 80), team("1-away", 90), team("2", 80), team("2-away", 90)],
      2,
    );
    expect(rows[0].game.id).toBe("1");
    expect(rows[0].reason).toBe("close");
  });

  it("uses source ranks to elevate a strong matchup when margins are similar", () => {
    const rows = selectBasketballWatchlist(
      [game("1", 8), game("2", 8)],
      [team("1", 1), team("1-away", 5), team("2", 80), team("2-away", 90)],
      2,
    );
    expect(rows[0].game.id).toBe("1");
    expect(rows[0].reason).toBe("ranked");
    expect(rows[0].home_rank).toBe(1);
  });

  it("withholds games without a stored prediction", () => {
    const missing = { ...game("1", 2), prediction: null };
    expect(selectBasketballWatchlist([missing], [], 6)).toEqual([]);
  });
});
