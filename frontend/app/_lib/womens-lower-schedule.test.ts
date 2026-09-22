import { describe, expect, it } from "vitest";
import { summarizeWomensLowerSchedule, type WomensLowerScheduleContest, womensLowerScheduleExport } from "./womens-lower-schedule";

const contest = (id: number, homeScore: number | null, awayScore: number | null, division = 2): WomensLowerScheduleContest => ({
  division,
  contest_id: id,
  state: "F",
  teams: [
    { home: true, slug: "home", name: "Home", score: homeScore },
    { home: false, slug: "away", name: "Away", score: awayScore },
  ],
});

describe("women's lower division schedule summaries", () => {
  it("keeps exact division records and sorts by win percentage then margin", () => {
    const rows = summarizeWomensLowerSchedule([
      contest(1, 70, 60),
      contest(2, 50, 55),
      contest(3, 80, 60),
      contest(4, 75, 65, 3),
    ], "2");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ team_key: "home", games: 3, wins: 2, losses: 1, points_for: 200, points_against: 175, rank: 1 });
    expect(rows[1]).toMatchObject({ team_key: "away", games: 3, wins: 1, losses: 2, rank: 2 });
  });

  it("excludes incomplete or non-final rows instead of treating missing scores as zero", () => {
    const rows = summarizeWomensLowerSchedule([
      contest(1, 70, null),
      { ...contest(2, 70, 60), state: "scheduled" },
      contest(3, 70, 60),
    ], "2");
    expect(rows.map((row) => row.games)).toEqual([1, 1]);
    expect(rows.every((row) => row.points_against > 0)).toBe(true);
  });

  it("does not merge missing-slug teams by display name", () => {
    const rows = summarizeWomensLowerSchedule([
      {
        ...contest(1, 70, 60),
        teams: [
          { home: true, name: "Unidentified", score: 70 },
          { home: false, slug: "away", name: "Away", score: 60 },
        ],
      },
      {
        ...contest(2, 80, 60),
        teams: [
          { home: true, name: "Unidentified", score: 80 },
          { home: false, slug: "away", name: "Away", score: 60 },
        ],
      },
    ], "2");
    expect(rows.filter((row) => row.slug == null)).toHaveLength(2);
    expect(rows.filter((row) => row.slug == null).every((row) => row.games === 1)).toBe(true);
  });

  it("exports exact-division schedule rows while retaining missing source values", () => {
    const exported = womensLowerScheduleExport([
      {
        ...contest(9, 72, null),
        source_path: "/game/9",
        contest_date: "11/04/2026",
        start_time: "19:00",
        state: "F",
        status: "final",
        teams: [
          { home: true, slug: "home", name: "Home", score: 72, winner: true },
          { home: false, slug: "away", name: "Away", score: null, winner: null },
        ],
      },
      contest(10, 80, 70, 3),
    ], "2");
    expect(exported.headers).toEqual(["Division", "Contest ID", "Source path", "Date", "Start time", "State", "Status", "Home team", "Home slug", "Home score", "Home winner", "Away team", "Away slug", "Away score", "Away winner"]);
    expect(exported.rows).toEqual([["D2", 9, "/game/9", "11/04/2026", "19:00", "F", "final", "Home", "home", 72, "true", "Away", "away", null, null]]);
  });
});
