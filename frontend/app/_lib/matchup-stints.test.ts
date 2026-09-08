import { describe, expect, it } from "vitest";
import { matchupStintFilterSearch, parseMatchupStintFilters, sortMatchupStints, type MatchupStint } from "./matchup-stints";

const row = (id: string, possessions: number, net_per_100: number): MatchupStint => ({
  id, season: 2026, home: "Alpha", away: "Beta", home_lineup: [], away_lineup: [],
  home_lineup_key: "h", away_lineup_key: "a", games: 1, stints: 1, duration_mins: 5,
  events: 5, possessions, home_points: 10, away_points: 5, net_per_100, home_per_100: 100, away_per_100: 50, last_date: "2025-11-01",
});

describe("matchup stint research filters", () => {
  it("round-trips a coaching slice", () => {
    const search = matchupStintFilterSearch({ season: 2022, query: "Kansas", minPoss: "100", sort: "net_per_100" }, 2026);
    expect(search).toBe("?season=2022&q=Kansas&minPoss=100&sort=net_per_100");
    expect(parseMatchupStintFilters(search, [2022, 2026], 2026)).toEqual({ season: 2022, query: "Kansas", minPoss: "100", sort: "net_per_100" });
  });

  it("sorts high-volume source matchups and rejects bad controls", () => {
    expect(sortMatchupStints([row("a", 20, 2), row("b", 100, -4)], "possessions").map((r) => r.id)).toEqual(["b", "a"]);
    expect(parseMatchupStintFilters("?season=1900&minPoss=999&sort=nope", [2022, 2026], 2026)).toEqual({ season: 2026, query: "", minPoss: "40", sort: "possessions" });
  });
});
