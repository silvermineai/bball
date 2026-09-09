import { describe, expect, it } from "vitest";
import {
  parseRosterFilters,
  rosterFilterOptions,
  rosterFilterSearch,
  sortRosterObservations,
  priorProductionIndex,
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

  it("sorts exact source publisher value without imputing missing rows", () => {
    const rows = sortRosterObservations(
      [
        { ...row("a", "Alpha", "same_program", "A", ["A"], 240), prior_production: { ...row("a", "Alpha", "same_program", "A", ["A"], 240).prior_production!, box_bpm: 2 } },
        { ...row("b", "Beta", "different_program", "B", ["A"], 620), prior_production: { ...row("b", "Beta", "different_program", "B", ["A"], 620).prior_production!, box_bpm: 7 } },
        row("c", "Gamma", "new_to_dataset", "C", []),
      ],
      "prior_bpm",
    );
    expect(rows.map((r) => r.name)).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  it("sorts role-specific production without filling missing values", () => {
    const rows = sortRosterObservations(
      [
        { ...row("a", "Alpha", "same_program", "A", [], 300), prior_production: { ...row("a", "Alpha", "same_program", "A", [], 300).prior_production!, rpg: 4, apg: null } },
        { ...row("b", "Beta", "different_program", "B", [], 400), prior_production: { ...row("b", "Beta", "different_program", "B", [], 400).prior_production!, rpg: 7, apg: 5 } },
        { ...row("c", "Gamma", "new_to_dataset", "C", []) },
      ],
      "prior_rpg",
    );
    expect(rows.map((r) => r.name)).toEqual(["Beta", "Alpha", "Gamma"]);
    const assists = sortRosterObservations(rows, "prior_apg");
    expect(assists.map((r) => r.name)).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  it("sorts defensive events and shot-profile rates with missing values last", () => {
    const rows = [
      { ...row("a", "Alpha", "same_program", "A", [], 300), prior_production: { ...row("a", "Alpha", "same_program", "A", [], 300).prior_production!, spg: 1.1, bpg: 0.2, three_pct: null, tov_rate: 0.18 } },
      { ...row("b", "Beta", "different_program", "B", [], 400), prior_production: { ...row("b", "Beta", "different_program", "B", [], 400).prior_production!, spg: 2.3, bpg: 1.4, three_pct: 0.42, tov_rate: 0.11 } },
      { ...row("c", "Gamma", "new_to_dataset", "C", []) },
    ];
    expect(sortRosterObservations(rows, "prior_spg").map((r) => r.name)).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(sortRosterObservations(rows, "prior_bpg").map((r) => r.name)).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(sortRosterObservations(rows, "prior_three_pct").map((r) => r.name)).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(sortRosterObservations(rows, "prior_tov_rate").map((r) => r.name)).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  it("calculates a cohort-relative prior production index without imputing missing rates", () => {
    const rows = [
      { ...row("a", "Alpha", "same_program", "A", [], 300, 0.55), prior_production: { ...row("a", "Alpha", "same_program", "A", [], 300, 0.55).prior_production!, rpg: 3, apg: 2, spg: 1, bpg: 0, efg: 0.5 } },
      { ...row("b", "Beta", "different_program", "B", [], 400, 0.70), prior_production: { ...row("b", "Beta", "different_program", "B", [], 400, 0.70).prior_production!, rpg: 8, apg: 6, spg: 2, bpg: 1, efg: 0.7 } },
      { ...row("c", "Gamma", "new_to_dataset", "C", []) },
    ];
    const index = priorProductionIndex(rows);
    expect(index.get("b-b")?.score).toBeGreaterThan(index.get("a-a")?.score ?? -Infinity);
    expect(index.get("c-c")).toEqual({ score: null, components: 0 });
    expect(sortRosterObservations(rows, "prior_index").map((r) => r.name)).toEqual(["Beta", "Alpha", "Gamma"]);
  });
});

describe("shareable roster observation filters", () => {
  it("parses supported values and ignores invalid values", () => {
    expect(parseRosterFilters("?view=observations&rosterSeason=2026&rosterQ=Arizona&rosterPosition=G&rosterClass=Senior&rosterStatus=different_program&rosterSort=prior_tov_rate&rosterPage=3")).toEqual({
      season: "2026",
      q: "Arizona",
      position: "G",
      classYear: "Senior",
      status: "different_program",
      sort: "prior_tov_rate",
      page: 3,
      picks: [],
    });
    expect(parseRosterFilters("?rosterSeason=2000&rosterStatus=nope&rosterSort=bad&rosterPage=-4")).toEqual({
      season: "2027",
      q: "",
      position: "",
      classYear: "",
      status: "all",
      sort: "status",
      page: 0,
      picks: [],
    });
  });

  it("omits defaults while preserving the exact recruiting slice", () => {
    expect(rosterFilterSearch({ season: "2026", q: "Arizona", position: "G", classYear: "Senior", status: "different_program", sort: "prior_tov_rate", page: 3, picks: ["123", "456"] })).toBe("?rosterSeason=2026&rosterQ=Arizona&rosterPosition=G&rosterClass=Senior&rosterStatus=different_program&rosterSort=prior_tov_rate&rosterPage=3&rosterPick=123&rosterPick=456");
    expect(rosterFilterSearch({ season: "2027", q: "", position: "", classYear: "", status: "all", sort: "status", page: 0, picks: [] })).toBe("");
  });

  it("limits shortlist IDs to twelve numeric source identities", () => {
    const ids = Array.from({ length: 14 }, (_, i) => String(i + 1));
    expect(parseRosterFilters(`?${ids.map((id) => `rosterPick=${id}`).join("&")}&rosterPick=bad&rosterPick=1`).picks).toEqual(ids.slice(0, 12));
  });

  it("keeps source position and class labels stable for filters", () => {
    expect(rosterFilterOptions([
      row("a", "Alpha", "same_program", "A", [], undefined),
      { ...row("b", "Beta", "new_to_dataset", "B", []), position: "F", class_year: "Junior" },
      { ...row("c", "Gamma", "different_program", "C", []), position: "G", class_year: "Senior" },
      { ...row("d", "Delta", "same_program", "D", []), position: "F", class_year: "Junior" },
    ])).toEqual({ positions: ["F", "G"], classes: ["Junior", "Senior"] });
  });
});
