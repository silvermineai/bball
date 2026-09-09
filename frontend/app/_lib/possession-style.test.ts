import { describe, expect, it } from "vitest";
import { filterAndSortStyle } from "./possession-style";

const rows = [
  { season: 2026, team_id: "2", team_name: "Alpha", games: 10, possessions: 700, points: 900, points_per_possession: 1.286, possessions_per_game: 70, transition_share: 0.2, assisted_share: 0.5, garbage_time_share: 0.1 },
  { season: 2026, team_id: "3", team_name: "Beta", games: 10, possessions: 800, points: 960, points_per_possession: 1.2, possessions_per_game: 80, transition_share: 0.3, assisted_share: 0.4, garbage_time_share: 0.2 },
];

describe("possession style view", () => {
  it("sorts by a selected style rate and filters by team", () => {
    expect(filterAndSortStyle(rows, "", "transition", "desc").map((row) => row.team_name)).toEqual(["Beta", "Alpha"]);
    expect(filterAndSortStyle(rows, "alpha", "possessions", "desc").map((row) => row.team_name)).toEqual(["Alpha"]);
  });

  it("keeps unavailable rates after sorting", () => {
    const withMissing = [{ ...rows[0], points_per_possession: null }, rows[1]];
    expect(filterAndSortStyle(withMissing, "", "ppp", "desc")[1].team_name).toBe("Alpha");
  });
});

