import { describe, expect, it } from "vitest";
import { buildPlayerStatCoverage, playerStatCoverageLabel } from "./ncaa-player-stat-coverage";

describe("NCAA player stat coverage", () => {
  it("keeps team stints in the denominator and treats zero as observed", () => {
    const groups = buildPlayerStatCoverage([
      { team_id: "a", stats: { pts: 12, fga: 0, rimm: null, custom: 3 } },
      { team_id: "b", stats: { pts: 8, fga: null, rimm: 0 } },
    ]);
    const scoring = groups.find((group) => group.key === "scoring");
    expect(scoring?.fields.find((field) => field.key === "pts")).toMatchObject({
      observedRows: 2,
      missingRows: 0,
      zeroRows: 0,
      status: "complete",
    });
    expect(scoring?.fields.find((field) => field.key === "fga")).toMatchObject({
      observedRows: 1,
      missingRows: 1,
      zeroRows: 1,
      status: "partial",
    });
    expect(groups.find((group) => group.key === "shot-zone")?.fields.find((field) => field.key === "rimm")).toMatchObject({
      observedRows: 1,
      missingRows: 1,
      zeroRows: 1,
      status: "partial",
    });
  });

  it("reports fields with no numeric evidence as unavailable", () => {
    const [group] = buildPlayerStatCoverage([{ team_id: "a", stats: { pts: null } }]);
    expect(group.fields[0]).toMatchObject({ key: "pts", observedRows: 0, missingRows: 1, status: "unavailable" });
    expect(playerStatCoverageLabel("unavailable")).toBe("Unavailable");
  });

  it("groups context fields separately from core scoring fields", () => {
    const groups = buildPlayerStatCoverage([{ team_id: "a", stats: { fgm_half: 4, pts_trans: 3, fgm_ast: 2, pace: 70 } }]);
    expect(groups.map((group) => group.key)).toEqual(["context", "other"]);
    expect(groups[0].fields.map((field) => field.key)).toEqual(["fgm_ast", "fgm_half", "pts_trans"]);
  });
});
