import { describe, expect, it } from "vitest";
import { filterDivisionOneTeams } from "./LiveTeamProductionTable";

describe("live team production filtering", () => {
  it("keeps only teams in the model's Division I cohort", () => {
    const rows = [
      { id: "d1", team: "D1 University", value: 90 },
      { id: "d2", team: "D2 College", value: 95 },
      { id: "d1b", team: "Another D1 University", value: 88 },
    ];
    expect(filterDivisionOneTeams(rows, new Set(["d1", "d1b"]))).toEqual([rows[0], rows[2]]);
  });
});
