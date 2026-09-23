import { describe, expect, it } from "vitest";
import { divisionTeamArchiveExport, filterDivisionTeams, parseDivisionTeams, rankDivisionTeams } from "./division-team-archive";

const release = {
  teams: [
    { team_ncaa_id: 2, division: 2, name: "Beta", conference: "East", games: 20, wins: 12, losses: 8, ppg: 78 },
    { team_ncaa_id: 1, division: 2, name: "Alpha", conference: "West", games: 20, wins: 16, losses: 4, ppg: 74 },
    { team_ncaa_id: 3, division: 3, name: "Gamma", conference: "North", games: 19, wins: 18, losses: 1, ppg: 81 },
  ],
};

describe("division team archive", () => {
  it("validates identity and keeps divisions separate", () => {
    const teams = parseDivisionTeams(release);
    expect(teams).toHaveLength(3);
    expect(filterDivisionTeams(teams, "2", "", "wins").map((team) => team.name)).toEqual(["Alpha", "Beta"]);
    expect(filterDivisionTeams(teams, "3", "gamma", "ppg").map((team) => team.name)).toEqual(["Gamma"]);
  });

  it("rejects malformed and duplicate rows", () => {
    expect(() => parseDivisionTeams({ teams: [{ team_ncaa_id: 1, division: 2 }] })).toThrow("malformed");
    expect(() => parseDivisionTeams({ teams: [release.teams[0], release.teams[0]] })).toThrow("duplicate");
  });

  it("exports the complete already-scoped team rows with stable fields", () => {
    const teams = parseDivisionTeams(release);
    const exported = divisionTeamArchiveExport(filterDivisionTeams(teams, "2", "", "wins"));
    expect(exported.headers).toEqual(["team_ncaa_id", "division", "name", "conference", "games", "wins", "losses", "ppg"]);
    expect(exported.rows).toEqual([
      [1, 2, "Alpha", "West", 20, 16, 4, 74],
      [2, 2, "Beta", "East", 20, 12, 8, 78],
    ]);
    expect(exported.rows.every((row) => row[1] === 2)).toBe(true);
  });

  it("assigns ranks within a division before a search filter", () => {
    const teams = parseDivisionTeams(release);
    expect(rankDivisionTeams(teams, "2", "wins").map((team) => [team.rank, team.name])).toEqual([
      [1, "Alpha"],
      [2, "Beta"],
    ]);
    expect(rankDivisionTeams(teams, "3", "win_rate").map((team) => team.rank)).toEqual([1]);
    expect(rankDivisionTeams([
      { team_ncaa_id: 8, division: 2, name: "Missing", conference: null, games: null, wins: null, losses: null, ppg: null },
      { team_ncaa_id: 9, division: 2, name: "Recorded", conference: null, games: 20, wins: 10, losses: 10, ppg: 70 },
    ], "2", "wins").map((team) => [team.rank, team.name])).toEqual([
      [1, "Recorded"],
      [null, "Missing"],
    ]);
  });

  it("uses competition ranks for equal recorded team values", () => {
    const ranked = rankDivisionTeams([
      { team_ncaa_id: 8, division: 2, name: "Alpha", conference: null, games: 20, wins: 15, losses: 5, ppg: 70 },
      { team_ncaa_id: 9, division: 2, name: "Beta", conference: null, games: 20, wins: 15, losses: 5, ppg: 70 },
      { team_ncaa_id: 10, division: 2, name: "Gamma", conference: null, games: 20, wins: 10, losses: 10, ppg: 70 },
      { team_ncaa_id: 11, division: 3, name: "Other Division", conference: null, games: 20, wins: 99, losses: 0, ppg: 99 },
    ], "2", "wins");
    expect(ranked.map((team) => [team.name, team.rank])).toEqual([
      ["Alpha", 1],
      ["Beta", 1],
      ["Gamma", 3],
    ]);
  });
});
