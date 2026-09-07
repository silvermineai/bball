import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  recruitingRows,
  publicationDate,
  parseRecruitingFilters,
  recruitingFilterSearch,
  sortRecruitingRows,
  summarizeRecruitingPrograms,
  type RecruitingRelease,
} from "./recruiting";
const data = JSON.parse(
  readFileSync("public/data/basketball/recruiting.json", "utf8"),
) as RecruitingRelease;
const stat = (mpg: number, ppg: number) => ({
  id: "player",
  team_id: "prior",
  team: "Prior",
  season: 2026,
  games: 20,
  mpg,
  ppg,
  rpg: null,
  apg: null,
  spg: null,
  bpg: null,
  topg: null,
  efg: null,
  ts: null,
  three_pct: null,
  ft_rate: null,
  three_rate: null,
  tov_rate: null,
  incomplete_box_games: 0,
  identity_basis: "test",
});
describe("school announcement histories", () => {
  it("shows a later availability report and preserves the signing", () => {
    const row = recruitingRows(data).find(
      (p) => p.name === "Brandon McCoy Jr.",
    )!;
    expect(row.latest.kind).toBe("season_unavailable");
    expect(row.timeline.map((e) => e.kind)).toContain("addition");
  });
  it("prioritizes a same-day planned redshirt over the addition", () => {
    const row = recruitingRows(data).find((p) => p.name === "Lincoln Cosby")!;
    expect(row.latest.kind).toBe("redshirt_announced");
    expect(row.timeline).toHaveLength(2);
  });
  it("preserves a publication calendar date in every local timezone", () => {
    expect(publicationDate("2026-04-28")).toBe("Apr 28, 2026");
  });
  it("sorts prior production without promoting missing stats", () => {
    const rows = recruitingRows(data).filter((p) =>
      ["Corey Hadnot II", "Najai Hines"].includes(p.name),
    );
    const sorted = sortRecruitingRows(rows, "ppg");
    expect(sorted[0].stats?.ppg).toBeGreaterThan(sorted[1].stats?.ppg ?? -1);
    expect(sortRecruitingRows(rows, "name").map((p) => p.name)).toEqual(
      [...rows].map((p) => p.name).sort(),
    );
  });
});

describe("recruiting program summaries", () => {
  it("aggregates linked prior production and identifies high-workload additions", () => {
    const rows = summarizeRecruitingPrograms([
      {
        team_id: "a",
        category: "transfer",
        program: { name: "Alpha" },
        stats: stat(21, 12),
      },
      {
        team_id: "a",
        category: "freshman",
        program: { name: "Alpha" },
        stats: null,
      },
      {
        team_id: "b",
        category: "transfer",
        program: { name: "Beta" },
        stats: stat(18, 9),
      },
    ]);
    expect(rows).toEqual([
      {
        team_id: "a",
        team_name: "Alpha",
        additions: 2,
        transfers: 1,
        linked_profiles: 1,
        prior_ppg: 12,
        prior_mpg: 21,
        high_workload: 1,
      },
      {
        team_id: "b",
        team_name: "Beta",
        additions: 1,
        transfers: 1,
        linked_profiles: 1,
        prior_ppg: 9,
        prior_mpg: 18,
        high_workload: 0,
      },
    ]);
  });
});

describe("shareable recruiting filters", () => {
  it("parses supported filters and ignores invalid choices", () => {
    expect(
      parseRecruitingFilters("?team=duke&q=Khamenia&kind=transfer&sort=mpg"),
    ).toEqual({ team: "duke", q: "Khamenia", kind: "transfer", sort: "mpg" });
    expect(parseRecruitingFilters("?kind=bogus&sort=bad")).toEqual({
      team: "all",
      q: "",
      kind: "all",
      sort: "latest",
    });
  });

  it("omits defaults while preserving meaningful values", () => {
    expect(
      recruitingFilterSearch({
        team: "duke",
        q: "Khamenia",
        kind: "transfer",
        sort: "mpg",
      }),
    ).toBe("?team=duke&q=Khamenia&kind=transfer&sort=mpg");
    expect(
      recruitingFilterSearch({ team: "all", q: "", kind: "all", sort: "latest" }),
    ).toBe("");
  });
});
