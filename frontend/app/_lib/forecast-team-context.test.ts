import { describe, expect, it } from "vitest";
import { matchupTeamRatings } from "./forecast-team-context";
import type { BBTeam } from "./basketball-types";

const rating = (id: string, name: string): BBTeam => ({
  id,
  name,
  rank: 1,
  adj_off: 120,
  adj_def: 95,
  adj_net: 25,
  adj_tempo: 68,
  games: 38,
  wins: 30,
  expected_wins: 28,
  luck: 2,
  luck_games: 38,
  sos: 5,
  sos_games: 38,
  efg: null,
  tov_rate: null,
  orb_rate: null,
  ft_rate: null,
  three_rate: null,
});

describe("matchupTeamRatings", () => {
  it("joins by exact source IDs and preserves zero-valued metrics", () => {
    const home = rating("10", "Same Name");
    const away = { ...rating("20", "Same Name"), adj_net: 0, games: 0 };
    const result = matchupTeamRatings([home, away], "10", "20");
    expect(result.home).toBe(home);
    expect(result.away).toBe(away);
    expect(result.away?.adj_net).toBe(0);
    expect(result.away?.games).toBe(0);
  });

  it("withholds a rating outside the selected model field", () => {
    const home = rating("10", "Home");
    const away = rating("20", "Away");
    const result = matchupTeamRatings([home, away], "10", "20", new Set(["10"]));
    expect(result.home?.id).toBe("10");
    expect(result.away).toBeNull();
  });

  it("returns null when an exact source ID is absent", () => {
    const result = matchupTeamRatings([rating("10", "Home")], "10", "20");
    expect(result.home?.name).toBe("Home");
    expect(result.away).toBeNull();
  });
});
