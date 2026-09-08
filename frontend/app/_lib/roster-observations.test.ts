import { describe, expect, it } from "vitest";
import {
  parseRosterFilters,
  rosterFilterSearch,
  sortRosterObservations,
} from "./roster-observations";
import type { BBRoster } from "./basketball-types";

const row = (
  id: string,
  name: string,
  status: string,
  team: string,
  previous_teams: string[],
  priorMinutes?: number,
  priorTs?: number,
): BBRoster => ({
  id,
  name,
  team_id: id,
  team,
  previous_teams,
  status,
  position: null,
  class_year: null,
  height: null,
  weight: null,
  source_url: null,
  prior_production:
    priorMinutes == null
      ? null
      : {
          games: 20,
          minutes: priorMinutes,
          mpg: priorMinutes / 20,
          ppg: 10,
        rpg: 5,
        apg: 2,
        ts: priorTs ?? null,
        teams: ["A"],
        },
});

describe("roster observation sorting", () => {
  it("puts movement signals ahead of returning observations", () => {
    const rows = sortRosterObservations(
      [
        row("a", "Alpha", "same_program", "A", ["A"]),
        row("b", "Beta", "different_program", "B", ["A"]),
        row("c", "Gamma", "new_to_dataset", "C", []),
      ],
      "status",
    );
    expect(rows.map((r) => r.name)).toEqual(["Beta", "Gamma", "Alpha"]);
  });

  it("sorts the prior-program signal by available history", () => {
    const rows = sortRosterObservations(
      [
        row("a", "Alpha", "same_program", "A", ["A"]),
        row("b", "Beta", "ambiguous", "B", ["A", "B"]),
      ],
      "prior",
    );
    expect(rows.map((r) => r.name)).toEqual(["Beta", "Alpha"]);
  });

  it("sorts roster observations by recorded prior workload", () => {
    const rows = sortRosterObservations(
      [
        row("a", "Alpha", "same_program", "A", ["A"], 240),
        row("b", "Beta", "different_program", "B", ["A"], 620),
        row("c", "Gamma", "new_to_dataset", "C", []),
      ],
      "workload",
    );
    expect(rows.map((r) => r.name)).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  it("sorts production views with missing values last", () => {
    const rows = sortRosterObservations(
      [row("a", "Alpha", "same_program", "A", ["A"], 240, 0.61), row("b", "Beta", "different_program", "B", ["A"], 620, 0.68), row("c", "Gamma", "new_to_dataset", "C", [])],
      "prior_ts",
    );
    expect(rows.map((r) => r.name)).toEqual(["Beta", "Alpha", "Gamma"]);
  });
});

describe("shareable roster observation filters", () => {
  it("parses supported values and ignores invalid values", () => {
    expect(parseRosterFilters("?view=observations&rosterSeason=2026&rosterQ=Arizona&rosterStatus=different_program&rosterSort=prior_ts&rosterPage=3")).toEqual({
      season: "2026",
      q: "Arizona",
      status: "different_program",
      sort: "prior_ts",
      page: 3,
    });
    expect(parseRosterFilters("?rosterSeason=2000&rosterStatus=nope&rosterSort=bad&rosterPage=-4")).toEqual({
      season: "2027",
      q: "",
      status: "all",
      sort: "status",
      page: 0,
    });
  });

  it("omits defaults while preserving the exact recruiting slice", () => {
    expect(rosterFilterSearch({ season: "2026", q: "Arizona", status: "different_program", sort: "prior_ts", page: 3 })).toBe("?rosterSeason=2026&rosterQ=Arizona&rosterStatus=different_program&rosterSort=prior_ts&rosterPage=3");
    expect(rosterFilterSearch({ season: "2027", q: "", status: "all", sort: "status", page: 0 })).toBe("");
  });
});
