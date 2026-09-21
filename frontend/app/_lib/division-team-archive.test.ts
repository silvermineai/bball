import { describe, expect, it } from "vitest";
import { divisionTeamArchiveExport, filterDivisionTeams, parseDivisionTeams } from "./division-team-archive";

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
});
