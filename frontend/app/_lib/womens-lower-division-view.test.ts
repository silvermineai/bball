import { describe, expect, it } from "vitest";
import {
  filterWomensLowerDivisionRows,
  lowerDivisionCellValue,
  lowerDivisionGames,
  paginateWomensLowerDivisionRows,
  summarizeWomensLowerDivisionCoverage,
  summarizeWomensLowerDivisionTeams,
  summarizeWomensLowerDivisionPlayers,
  womensLowerIndividualExport,
} from "./womens-lower-division-view";

const rows = [
  { rank: 1, name: "Ari Jones", team: "North College", g: 18, source_fields: { Name: "Ari Jones", Team: "North College", G: "18" } },
  { rank: 2, name: "Bea Smith", team: "South College", g: 9, source_fields: { Name: "Bea Smith", Team: "South College", G: "9" } },
  { rank: 3, name: "Cam Lee", team: "East College", g: 22, source_fields: { Name: "Cam Lee", Team: "East College", G: "22" } },
];

describe("women's lower-division source row view", () => {
  it("reports source table coverage without calling repeated leaderboard rows unique players", () => {
    expect(summarizeWomensLowerDivisionCoverage({
      through_games: "Saturday, March 28, 2026",
      individual: [
        { rows: [{ name: "A" }, { name: "B" }] },
        { rows: [{ name: "A" }], through_games: "Saturday, March 28, 2026" },
      ],
      team: [{ rows: [{ team: "North" }] }],
    })).toEqual({
      individual_statistics: 2,
      team_statistics: 1,
      individual_rows: 3,
      team_rows: 1,
      through_games: "Saturday, March 28, 2026",
    });
  });

  it("searches retained source values and preserves publisher order", () => {
    expect(filterWomensLowerDivisionRows(rows, "south").map((row) => row.rank)).toEqual([2]);
    expect(filterWomensLowerDivisionRows(rows, "college").map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it("uses the source games field for an exact minimum-games filter", () => {
    expect(filterWomensLowerDivisionRows(rows, "", 10).map((row) => row.rank)).toEqual([1, 3]);
    expect(lowerDivisionGames({ team: "A", gm: "12", source_fields: { GM: "12" } })).toBe(12);
    expect(lowerDivisionGames({ team: "A", source_fields: { GM: "—" } })).toBeNull();
  });

  it("renders the retained source value for headers whose normalized key differs", () => {
    const row = { fg: 50.41, source_fields: { "FG%": "50.41", "Points Per Game": "18.2" } };
    expect(lowerDivisionCellValue(row, "FG%")).toBe("50.41");
    expect(lowerDivisionCellValue(row, "Points Per Game")).toBe("18.2");
    expect(lowerDivisionCellValue(row, "FGM")).toBeUndefined();
  });

  it("paginates without changing the source row objects", () => {
    expect(paginateWomensLowerDivisionRows(rows, 0, 2).map((row) => row.rank)).toEqual([1, 2]);
    expect(paginateWomensLowerDivisionRows(rows, 1, 2).map((row) => row.rank)).toEqual([3]);
    expect(paginateWomensLowerDivisionRows(rows, -1, 2).map((row) => row.rank)).toEqual([1, 2]);
  });

  it("builds a source-native team index from exact publisher paths", () => {
    const summary = summarizeWomensLowerDivisionTeams([
      {
        statistic: "scoring",
        label: "Scoring",
        source_url: "https://www.ncaa.com/stats/basketball-women/d2/current/team/101",
        rows: [
          { rank: 4, team: "North College", team_source_path: "/schools/north", gm: 18 },
          { rank: 12, team: "South College", team_source_path: "/schools/south", gm: 8 },
        ],
      },
      {
        statistic: "assists",
        label: "Assists",
        source_url: "https://www.ncaa.com/stats/basketball-women/d2/current/team/102",
        rows: [
          { rank: 2, team: "North College", team_source_path: "/schools/north", gm: 20 },
          { rank: 8, team: "North College", team_source_path: "/schools/north", gm: 7 },
        ],
      },
    ], 10);
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      team_source_path: "/schools/north",
      team: "North College",
      appearances: 2,
      best_source_rank: 2,
    });
    expect(summary[0].statistics.map((stat) => stat.statistic)).toEqual(["assists", "scoring"]);
    expect(summary[0].name_variants).toEqual(["North College"]);
  });

  it("keeps same-named teams separate when the publisher supplies different paths", () => {
    const summary = summarizeWomensLowerDivisionTeams([{
      statistic: "scoring",
      label: "Scoring",
      source_url: "https://www.ncaa.com/stats/basketball-women/d3/current/team/101",
      rows: [
        { rank: 1, team: "Central", team_source_path: "/schools/central-east", gm: 20 },
        { rank: 2, team: "Central", team_source_path: "/schools/central-west", gm: 20 },
      ],
    }]);
    expect(summary.map((team) => team.team_source_path)).toEqual(["/schools/central-east", "/schools/central-west"]);
  });

  it("exports all individual leaderboards with statistic context and source fields", () => {
    const result = womensLowerIndividualExport([
      {
        statistic: "scoring",
        label: "Scoring",
        source_url: "https://www.ncaa.com/stats/basketball-women/d2/current/individual/101",
        rows: [{ rank: 1, team_source_path: "/schools/north", source_fields: { Rank: "1", Name: "Ari Jones", PPG: "20.0" } }],
      },
      {
        statistic: "assists",
        label: "Assists",
        source_url: "https://www.ncaa.com/stats/basketball-women/d2/current/individual/102",
        rows: [{ rank: 2, source_fields: { Rank: "2", Name: "Ari Jones", AST: "100" } }],
      },
    ]);
    expect(result.headers).toEqual(["Statistic", "Source label", "Source URL", "Source rank", "Team source path", "Rank", "Name", "PPG", "AST"]);
    expect(result.rows).toEqual([
      ["scoring", "Scoring", "https://www.ncaa.com/stats/basketball-women/d2/current/individual/101", 1, "/schools/north", "1", "Ari Jones", "20.0", null],
      ["assists", "Assists", "https://www.ncaa.com/stats/basketball-women/d2/current/individual/102", 2, null, "2", "Ari Jones", null, "100"],
    ]);
  });

  it("applies the ranking search and minimum-games filter to source exports", () => {
    const result = womensLowerIndividualExport([{
      statistic: "scoring",
      label: "Scoring",
      source_url: "https://www.ncaa.com/stats/basketball-women/d2/current/individual/101",
      rows: [
        { rank: 1, name: "Ari Jones", g: 18, source_fields: { Name: "Ari Jones", G: "18", PPG: "20.0" } },
        { rank: 2, name: "Bea Smith", g: 4, source_fields: { Name: "Bea Smith", G: "4", PPG: "19.0" } },
      ],
    }], "Ari", 10);
    expect(result.rows).toEqual([[
      "scoring", "Scoring", "https://www.ncaa.com/stats/basketball-women/d2/current/individual/101", 1, null, "Ari Jones", "18", "20.0",
    ]]);
  });

  it("builds a source-label player coverage index without joining names across teams", () => {
    const summary = summarizeWomensLowerDivisionPlayers([
      {
        statistic: "scoring",
        label: "Scoring",
        source_url: "https://www.ncaa.com/stats/basketball-women/d2/current/individual/101",
        rows: [
          { rank: 4, name: "Ari Jones", team: "North College", team_source_path: "/schools/north", g: 18 },
          { rank: 1, name: "Ari Jones", team: "South College", team_source_path: "/schools/south", g: 18 },
        ],
      },
      {
        statistic: "assists",
        label: "Assists",
        source_url: "https://www.ncaa.com/stats/basketball-women/d2/current/individual/102",
        rows: [{ rank: 2, name: "Ari Jones", team: "North College", team_source_path: "/schools/north", g: 20 }],
      },
    ]);
    expect(summary).toHaveLength(2);
    expect(summary[0]).toMatchObject({ source_player: "Ari Jones", team: "North College", team_source_path: "/schools/north", appearances: 2, best_source_rank: 2 });
    expect(summary[0].statistics.map((stat) => stat.statistic)).toEqual(["assists", "scoring"]);
    expect(summary[1].team_source_path).toBe("/schools/south");
  });
});
