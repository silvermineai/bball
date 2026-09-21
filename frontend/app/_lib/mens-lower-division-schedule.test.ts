import { describe, expect, it } from "vitest";
import { scopedMensLowerSchedule, upcomingMensLowerSchedule } from "./mens-lower-division-schedule";

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
});

