import { describe, expect, it } from "vitest";
import { recordedSchoolPrograms } from "./recorded-school-board";

const programs = [{ id: "150", name: "Duke Blue Devils", shortName: "Duke" }];
const row = {
  edition: "2027-09-19",
  school_id: "150",
  prospect_total: 8,
  uncommitted_total: 5,
  committed_here_total: 2,
  ranked_total: 7,
  top100_total: 4,
  best_rank: 8,
  average_rank: 73.4,
  position_breakdown: [{ position: "PG", total: 3 }, { position: "C", total: 5 }],
};

describe("recorded school program board", () => {
  it("resolves exact school IDs only inside the expected edition", () => {
    expect(recordedSchoolPrograms([row], "2027-09-19", programs)).toEqual([expect.objectContaining({
      school_id: "150",
      name: "Duke",
      resolved: true,
      prospect_total: 8,
      edition: "2027-09-19",
    })]);
    expect(recordedSchoolPrograms([{ ...row, edition: "older" }], "2027-09-19", programs)).toEqual([]);
  });

  it("keeps valid unresolved IDs visible without inventing a program name", () => {
    expect(recordedSchoolPrograms([{ ...row, school_id: "999" }], row.edition, programs)[0]).toEqual(expect.objectContaining({
      school_id: "999",
      name: "Program 999",
      resolved: false,
    }));
  });

  it("withholds impossible counts, incomplete position denominators and duplicate IDs", () => {
    expect(recordedSchoolPrograms([{ ...row, top100_total: 9 }], row.edition, programs)).toEqual([]);
    expect(recordedSchoolPrograms([{ ...row, position_breakdown: [{ position: "PG", total: 7 }] }], row.edition, programs)).toEqual([]);
    expect(recordedSchoolPrograms([row, row], row.edition, programs)).toEqual([]);
  });

  it("requires rank denominators to agree with best and average rank", () => {
    expect(recordedSchoolPrograms([{ ...row, ranked_total: 0, top100_total: 0 }], row.edition, programs)).toEqual([]);
    expect(recordedSchoolPrograms([{ ...row, ranked_total: 0, top100_total: 0, best_rank: null, average_rank: null }], row.edition, programs)).toHaveLength(1);
  });
});
