import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { BBGame, BBTeam } from "../_lib/basketball-types";
import LiveBasketballJournal from "./LiveBasketballJournal";

const game: BBGame = {
  id: "401000001",
  season: 2027,
  starts_at: "2026-11-01T19:00:00Z",
  home_id: "1",
  away_id: "2",
  home_name: "Home College",
  away_name: "Away College",
  neutral: 0,
  time_tbd: 0,
  venue: "Arena",
  broadcast: "",
  prediction: {
    home_score: 75,
    away_score: 70,
    home_margin: 5,
    total: 145,
    pace: 70,
    home_win_probability: 0.65,
    margin_low: -4,
    margin_high: 14,
  },
};

const team = (id: string, name: string, adj_net: number): BBTeam => ({
  id,
  name,
  rank: 1,
  adj_off: 110,
  adj_def: 95,
  adj_net,
  adj_tempo: 70,
  games: 20,
  wins: 15,
  expected_wins: 14,
  luck: 0,
  luck_games: 20,
  sos: 5,
  sos_games: 20,
  efg: 0.53,
  tov_rate: 0.16,
  orb_rate: 0.28,
  ft_rate: 0.2,
  three_rate: 0.38,
});

describe("live basketball journal team context", () => {
  it("renders exact-ID team ratings when the journal receives the rating edition", () => {
    const html = renderToStaticMarkup(
      <LiveBasketballJournal
        games={[game]}
        ratings={[team("1", "Home College", 15.2), team("2", "Away College", 8.7)]}
      />,
    );

    expect(html).toContain("Latest team net");
    expect(html).toContain("Away College 8.7");
    expect(html).toContain("Home College 15.2");
  });
});
