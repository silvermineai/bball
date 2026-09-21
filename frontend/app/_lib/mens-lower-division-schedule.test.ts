import { describe, expect, it } from "vitest";
import { mensLowerDivisionStandings, scopedMensLowerSchedule, upcomingMensLowerSchedule } from "./mens-lower-division-schedule";

const contest = (division: number, contest_id: number, contest_date: string) => ({
  division,
  contest_id,
  contest_date,
  teams: [{ home: true, name: "Home" }, { home: false, name: "Away" }],
});

describe("men's lower-division schedule view", () => {
  it("keeps contests scoped to the requested exact division", () => {
    const asset = { contests: [contest(2, 2, "01/02/2026"), contest(3, 3, "01/03/2026")] };
    expect(scopedMensLowerSchedule(asset, "2").map((row) => row.contest_id)).toEqual([2]);
  });

  it("does not invent upcoming games from missing or invalid dates", () => {
    const asset = { contests: [contest(2, 2, "01/02/2026"), { ...contest(2, 4, "bad"), contest_date: null }] };
    expect(upcomingMensLowerSchedule(asset, "2", Date.parse("2026-01-01T00:00:00Z")).map((row) => row.contest_id)).toEqual([2]);
  });

  it("derives exact-division standings from final scores and withholds incomplete rows", () => {
    const asset = {
      contests: [
        { division: 2, contest_id: 10, state: "F", teams: [
          { home: true, slug: "alpha", name: "Alpha", conference: "A", score: 80 },
          { home: false, slug: "beta", name: "Beta", conference: "B", score: 70 },
        ] },
        { division: 2, contest_id: 11, status: "final", teams: [
          { home: true, slug: "alpha", name: "Alpha", score: 60 },
          { home: false, slug: "beta", name: "Beta", score: 75 },
        ] },
        { division: 2, contest_id: 12, status: "scheduled", teams: [
          { home: true, slug: "alpha", name: "Alpha", score: 99 },
          { home: false, slug: "beta", name: "Beta", score: 1 },
        ] },
        { division: 2, contest_id: 13, state: "F", teams: [
          { home: true, slug: "alpha", name: "Alpha" },
          { home: false, slug: "beta", name: "Beta", score: 1 },
        ] },
        { division: 3, contest_id: 14, state: "F", teams: [
          { home: true, slug: "alpha", name: "Alpha", score: 100 },
          { home: false, slug: "beta", name: "Beta", score: 0 },
        ] },
      ],
    };
    const standings = mensLowerDivisionStandings(asset, "2");
    expect(standings.map((row) => row.team_key)).toEqual(["slug:beta", "slug:alpha"]);
    expect(standings.find((row) => row.team_key === "slug:alpha")).toEqual(expect.objectContaining({ games: 2, wins: 1, losses: 1, ties: 0, points_for: 140, points_against: 145, point_diff: -5, win_pct: 0.5 }));
    expect(standings.find((row) => row.team_key === "slug:beta")).toEqual(expect.objectContaining({ games: 2, wins: 1, losses: 1, ties: 0, points_for: 145, points_against: 140, point_diff: 5, win_pct: 0.5 }));
    expect(mensLowerDivisionStandings(asset, "3")).toHaveLength(2);
  });
});
