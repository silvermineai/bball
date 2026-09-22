import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  archivedClassCoverage,
  archivedClassGap,
  filterArchivedTeamOutlooks,
  parseArchivedRecruitingRelease,
} from "./archived-recruiting";

const release = parseArchivedRecruitingRelease(JSON.parse(
  readFileSync("public/data/recruiting.json", "utf8"),
));

describe("retained team recruiting outlook", () => {
  it("admits the complete retained snapshot with unique identities", () => {
    expect(release.season).toBe("2025-26");
    expect(release.teams).toHaveLength(361);
    expect(new Set(release.teams.map((team) => team.id)).size).toBe(361);
    expect(new Set(release.teams.map((team) => team.srsRank)).size).toBe(361);
    expect(release.teams.every((team) => team.departingNames.length === team.departingCount)).toBe(true);
  });

  it("preserves an unclassified class count instead of filling the gap", () => {
    const floridaState = release.teams.find((team) => team.name === "Florida State Seminoles")!;
    expect(archivedClassGap(floridaState)).toBe(1);
    expect(archivedClassCoverage(floridaState)).toEqual({ labeled: 14, roster: 15, unavailable: 1 });
    expect(floridaState.classBreakdown).not.toHaveProperty("Unclassified");
  });

  it("withholds class coverage when labels exceed the retained roster denominator", () => {
    const team = { ...release.teams[0], rosterSize: 1, classBreakdown: { Freshman: 2 } };
    expect(archivedClassCoverage(team)).toBeNull();
  });

  it("filters, sorts and paginates without mutating source rows", () => {
    const before = release.teams.map((team) => team.id);
    const result = filterArchivedTeamOutlooks(release.teams, {
      query: "Big Ten",
      conference: "Big Ten Conference",
      sort: "departure_share",
      direction: "desc",
      page: 0,
      pageSize: 5,
    });
    expect(result.total).toBeGreaterThan(10);
    expect(result.rows).toHaveLength(5);
    expect(result.rows[0].departingShare).toBeGreaterThanOrEqual(result.rows[1].departingShare);
    expect(release.teams.map((team) => team.id)).toEqual(before);
  });

  it("rejects malformed or duplicate rows before publication", () => {
    const duplicate = { ...release.teams[1], id: release.teams[0].id };
    expect(() => parseArchivedRecruitingRelease({ season: release.season, teams: [release.teams[0], duplicate] })).toThrow(/duplicate team IDs/);
    expect(() => parseArchivedRecruitingRelease({ season: release.season, teams: [{ ...release.teams[0], departingNames: [] }] })).toThrow(/malformed team row/);
  });
});
