import { describe, expect, it } from "vitest";
import { footballSourceCoverageRows } from "./football-source-coverage";

describe("football source coverage", () => {
  it("keeps exact counts and distinguishes deferred counts from zero", () => {
    expect(footballSourceCoverageRows(
      [
        { dataset: "box", rows: 12 },
        { dataset: "betting", rows: null },
        { dataset: "teams", rows: 0 },
      ],
      { box: "Player box scores", betting: "Historical market archive" },
    )).toEqual([
      { dataset: "box", rows: 12, label: "Player box scores", count_status: "exact" },
      { dataset: "betting", rows: null, label: "Historical market archive", count_status: "deferred" },
      { dataset: "teams", rows: 0, label: "teams", count_status: "exact" },
    ]);
  });

  it("deduplicates malformed or repeated catalog entries without inventing rows", () => {
    expect(footballSourceCoverageRows(
      [
        { dataset: "passing", rows: -1 },
        { dataset: "passing", rows: 99 },
        { dataset: "", rows: 4 },
      ],
      null,
    )).toEqual([
      { dataset: "passing", rows: null, label: "passing", count_status: "deferred" },
    ]);
  });
});
