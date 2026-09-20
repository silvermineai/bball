import { describe, expect, it } from "vitest";
import type { BBRoster } from "../_lib/basketball-types";
import { notebookRosterRoleContext, summarizeNotebookRoster } from "./notebook-roster";

const player = (overrides: Partial<BBRoster>): BBRoster => ({
  id: "1",
  name: "Player",
  team_id: "10",
  team: "Program",
  previous_teams: [],
  status: "same_program",
  position: "G",
  class_year: "JR",
  height: null,
  weight: null,
  source_url: null,
  prior_production: null,
  ...overrides,
});

describe("summarizeNotebookRoster", () => {
  it("keeps each retained observation status separate", () => {
    const summary = summarizeNotebookRoster([
      player({ id: "1", status: "same_program" }),
      player({ id: "2", status: "different_program" }),
      player({ id: "3", status: "new_to_dataset" }),
      player({ id: "4", status: "ambiguous" }),
      player({ id: "5", status: "unrecognized" }),
    ]);

    expect(summary).toMatchObject({
      listed: 5,
      sameProgram: 1,
      differentProgram: 1,
      newToDataset: 1,
      ambiguousOrOther: 2,
    });
  });

  it("counts and sums only valid retained prior-production profiles", () => {
    const production = {
      games: 30,
      minutes: 900,
      mpg: 30,
      ppg: 14,
      rpg: 5,
      apg: 3,
      teams: ["Program"],
    };
    const summary = summarizeNotebookRoster([
      player({ id: "1", prior_production: production }),
      player({ id: "2", prior_production: { ...production, minutes: 400 } }),
      player({ id: "3", prior_production: { ...production, minutes: Number.NaN } }),
      player({ id: "4", prior_production: null }),
    ]);

    expect(summary.priorProfiles).toBe(2);
    expect(summary.priorMinutes).toBe(1300);
  });

  it("separates same-program, different-program and other minutes by source role", () => {
    const production = { games: 30, minutes: 600, mpg: 20, ppg: 10, rpg: 4, apg: 2, teams: ["Program"] };
    const context = notebookRosterRoleContext([
      player({ id: "1", team_id: "10", position: "PG", status: "same_program", prior_production: production }),
      player({ id: "2", team_id: "10", position: "SG", status: "different_program", prior_production: { ...production, minutes: 300 } }),
      player({ id: "3", team_id: "10", position: "G", status: "ambiguous", prior_production: { ...production, minutes: 100 } }),
      player({ id: "4", team_id: "10", position: "C", status: "new_to_dataset", prior_production: null }),
    ], "10", 2027, { dataset: "rosters", url: null, fetched_at: "2026-09-19T00:00:00Z", sha256: "a".repeat(64) });

    expect(context?.roles.find((row) => row.role === "guard")).toEqual({
      role: "guard",
      listed: 3,
      priorProfiles: 3,
      priorMinutes: 1000,
      sameProgramMinutes: 600,
      differentProgramMinutes: 300,
      otherPriorMinutes: 100,
    });
    expect(context?.roles.find((row) => row.role === "center")).toEqual(expect.objectContaining({ listed: 1, priorProfiles: 0, priorMinutes: 0 }));
  });

  it("withholds role context on mixed teams, repeated IDs, malformed workload or a missing receipt", () => {
    const production = { games: 30, minutes: 600, mpg: 20, ppg: 10, rpg: 4, apg: 2, teams: ["Program"] };
    const source = { dataset: "rosters", url: null, fetched_at: null, sha256: "a".repeat(64) };
    expect(notebookRosterRoleContext([player({ team_id: "11", prior_production: production })], "10", 2027, source)).toBeNull();
    expect(notebookRosterRoleContext([player({ id: "1" }), player({ id: "1" })], "10", 2027, source)).toBeNull();
    expect(notebookRosterRoleContext([player({ prior_production: { ...production, minutes: Number.NaN } })], "10", 2027, source)).toBeNull();
    expect(notebookRosterRoleContext([player({ prior_production: production })], "10", 2027, { ...source, sha256: null })).toBeNull();
  });
});
