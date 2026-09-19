import { describe, expect, it } from "vitest";
import {
  combineProgramProspectClasses,
  isExactProgramProspect,
  programProspectEvidence,
  type ProgramProspect,
} from "./ProgramProspects";

const prospect = (overrides: Partial<ProgramProspect> = {}): ProgramProspect => ({
  athlete_id: "1",
  name: "Example Prospect",
  position: "PG",
  rank: 20,
  grade: 94,
  status: null,
  committed_team_id: null,
  committed_team_name: null,
  school_ids: ["2755"],
  high_school: "Example Prep",
  hometown: "Example, CA",
  ...overrides,
});

describe("program prospect evidence", () => {
  it("distinguishes a recorded commitment from a listed-school record", () => {
    expect(programProspectEvidence(prospect({ committed_team_id: "2755" }), "2755")).toBe("Recorded commitment");
    expect(programProspectEvidence(prospect(), "2755")).toBe("Listed school");
    expect(isExactProgramProspect(prospect(), "2755")).toBe(true);
    expect(isExactProgramProspect(prospect({ school_ids: ["999"] }), "2755")).toBe(false);
  });

  it("keeps class identity and sorts recorded ranks without inventing missing values", () => {
    const rows = combineProgramProspectClasses([
      { season: 2027, total: 2, cohort: { committed: 0 }, edition: "b", captured_at: "2026-09-01", rows: [
        prospect({ athlete_id: "2", name: "Unranked", rank: null }),
        prospect({ athlete_id: "1", name: "Ranked", rank: 40 }),
        prospect({ athlete_id: "4", name: "Wrong program", rank: 1, school_ids: ["999"] }),
      ] },
      { season: 2026, total: 1, cohort: { committed: 1 }, edition: "a", captured_at: "2026-08-01", rows: [
        prospect({ athlete_id: "3", name: "Committed", rank: 80, committed_team_id: "2755" }),
      ] },
    ], "2755");

    expect(rows.map((row) => `${row.season}:${row.name}:${row.rank ?? "missing"}`)).toEqual([
      "2026:Committed:80",
      "2027:Ranked:40",
      "2027:Unranked:missing",
    ]);
    expect(rows[0].evidence).toBe("Recorded commitment");
  });
});
