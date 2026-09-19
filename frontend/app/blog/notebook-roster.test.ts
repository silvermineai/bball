import { describe, expect, it } from "vitest";
import type { BBRoster } from "../_lib/basketball-types";
import { summarizeNotebookRoster } from "./notebook-roster";

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
});
