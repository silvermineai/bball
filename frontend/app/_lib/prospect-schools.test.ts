import { describe, expect, it } from "vitest";
import { prospectSchools } from "./prospect-schools";

const programs = [
  { id: "2", name: "Auburn Tigers", shortName: "Auburn" },
  { id: "150", name: "Duke Blue Devils", shortName: "Duke" },
];

describe("prospect school evidence", () => {
  it("deduplicates IDs, resolves names and keeps the commitment first", () => {
    expect(prospectSchools(["150", "2", "150"], programs, "2")).toEqual([
      { id: "2", name: "Auburn", committed: true, resolved: true },
      { id: "150", name: "Duke", committed: false, resolved: true },
    ]);
  });

  it("keeps unresolved source IDs visible without inventing a school name", () => {
    expect(prospectSchools(["999", null, ""], programs, null)).toEqual([
      { id: "999", name: "Program 999", committed: false, resolved: false },
    ]);
  });

  it("treats malformed school lists as unavailable", () => {
    expect(prospectSchools("150", programs, null)).toEqual([]);
  });
});
