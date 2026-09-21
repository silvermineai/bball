import { describe, expect, it } from "vitest";
import { womensLowerRankingRows, womensLowerRankingValueLabel } from "./womens-lower-division-rankings";
import type { WomensLowerDivisionStatistic } from "./womens-lower-division-integrity";

const statistic = {
  label: "Points Per Game",
  statistic: "scoring_per_game",
  headers: ["Rank", "Name", "Team", "Position", "G", "PPG"],
  source_url: "https://www.ncaa.com/stats/basketball-women/d2/scoring-per-game",
  rows: [
    { rank: 2, name: "Ava Reed", team: "North", position: "G", g: 12, ppg: 21.4, team_source_path: "/schools/north", source_fields: { Rank: "2", Name: "Ava Reed", Team: "North", Position: "G", G: "12", PPG: "21.4" } },
    { rank: 1, name: "Bea Cole", team: "South", position: "F", g: 8, ppg: 23.1, team_source_path: "/schools/south", source_fields: { Rank: "1", Name: "Bea Cole", Team: "South", Position: "F", G: "8", PPG: "23.1" } },
  ],
  through_games: "2026-03-01",
} as unknown as WomensLowerDivisionStatistic;

describe("women's lower-division rankings", () => {
  it("preserves source rank and identifies the published value field", () => {
    expect(womensLowerRankingValueLabel(statistic)).toBe("PPG");
    expect(womensLowerRankingRows(statistic).map((row) => [row.rank, row.name, row.value])).toEqual([[1, "Bea Cole", "23.1"], [2, "Ava Reed", "21.4"]]);
  });

  it("filters by exact retained text and minimum recorded games without joining names", () => {
    expect(womensLowerRankingRows(statistic, "north", 10).map((row) => row.name)).toEqual(["Ava Reed"]);
    expect(womensLowerRankingRows(statistic, "south", 10)).toEqual([]);
  });
});
