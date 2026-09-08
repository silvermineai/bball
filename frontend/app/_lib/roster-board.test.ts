import { describe, expect, it } from "vitest";
import { parseRosterBoardFilters, rosterBoardRows, rosterBoardSortSearch } from "./roster-board";
import type { BBRosters } from "./basketball-types";

const data: BBRosters = {
  season: 2027,
  previous_season: 2026,
  teams_observed: 1,
  players_observed: 3,
  prior_players_not_observed: 0,
  status_counts: {},
  players: [
    {
      id: "1", name: "A Guard", team_id: "1", team: "Test U", previous_teams: ["Old U"], status: "different_program", position: "G", class_year: null, height: null, weight: null, source_url: null,
      prior_production: { games: 30, minutes: 900, mpg: 30, ppg: 14, rpg: 4, apg: 3, spg: 1, bpg: 0, topg: 2, efg: .55, ts: .58, box_bpm: 3, three_pct: .35, ft_rate: .2, three_rate: .4, tov_rate: .12, teams: ["Old U"] },
    },
    {
      id: "2", name: "B Wing", team_id: "1", team: "Test U", previous_teams: ["Test U"], status: "same_program", position: "F", class_year: null, height: null, weight: null, source_url: null,
      prior_production: { games: 28, minutes: 560, mpg: 20, ppg: 10, rpg: 6, apg: 2, spg: 1, bpg: 1, topg: 1, efg: .6, ts: .62, box_bpm: 8, three_pct: .4, ft_rate: .3, three_rate: .3, tov_rate: .1, teams: ["Test U"] },
    },
    {
      id: "3", name: "C Freshman", team_id: "1", team: "Test U", previous_teams: [], status: "new_to_dataset", position: "G", class_year: "FR", height: null, weight: null, source_url: null, prior_production: null,
    },
  ],
};

describe("roster workload board", () => {
  it("ranks prior workload and preserves ties", () => {
    const rows = rosterBoardRows(data, { query: "", status: "all", sort: "mpg", minimumMinutes: 0 });
    expect(rows.map((row) => row.id)).toEqual(["1", "2", "3"]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, null]);
    expect(rows[0].workload_label).toBe("High workload");
    expect(rows[1].workload_label).toBe("Rotation workload");
  });
  it("filters status, program text and minimum prior minutes", () => {
    const rows = rosterBoardRows(data, { query: "old", status: "different_program", sort: "ppg", minimumMinutes: 20 });
    expect(rows.map((row) => row.name)).toEqual(["A Guard"]);
  });
  it("ranks publisher Box BPM while keeping players without a value last", () => {
    const rows = rosterBoardRows(data, { query: "", status: "all", sort: "box_bpm", minimumMinutes: 0 });
    expect(rows.map((row) => row.id)).toEqual(["2", "1", "3"]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, null]);
  });
  it("round-trips shareable controls and rejects invalid values", () => {
    const search = rosterBoardSortSearch({ query: "Duke", status: "same_program", sort: "ts", minimumMinutes: 20 });
    expect(parseRosterBoardFilters(search)).toEqual({ query: "Duke", status: "same_program", sort: "ts", minimumMinutes: 20 });
    expect(parseRosterBoardFilters("?status=nope&sort=nope&min=99")).toEqual({ query: "", status: "all", sort: "mpg", minimumMinutes: 0 });
  });
});
