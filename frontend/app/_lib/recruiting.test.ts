import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  recruitingRows,
  parseRecruitingRelease,
  recruitingRosterProductionComparisons,
  publicationDate,
  parseRecruitingCoverageFilters,
  parseRecruitingFilters,
  recruitingFilterSearch,
  sortRecruitingRows,
  sortRecruitingReviewRows,
  summarizeRecruitingPrograms,
  summarizeRecruitingActivity,
  rosterNameMatch,
  type RecruitingRelease,
} from "./recruiting";
import type { BBRosters } from "./basketball-types";
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
  ft_pct: null,
  ft_rate: null,
  three_rate: null,
  tov_rate: null,
  incomplete_box_games: 0,
  identity_basis: "test",
});
describe("school announcement histories", () => {
  it("accepts the complete source graph and withholds broken live packets", () => {
    expect(parseRecruitingRelease(data)?.coverage).toEqual(data.coverage);
    const broken = JSON.parse(JSON.stringify(data)) as RecruitingRelease;
    broken.events[0].source_id = "missing-source";
    expect(parseRecruitingRelease(broken)).toBeNull();
    const countMismatch = JSON.parse(JSON.stringify(data)) as RecruitingRelease;
    countMismatch.coverage.events -= 1;
    expect(parseRecruitingRelease(countMismatch)).toBeNull();
  });
  it("shows a later availability report and preserves the signing", () => {
    const row = recruitingRows(data).find(
      (p) => p.name === "Brandon McCoy Jr.",
    )!;
    expect(row.latest.kind).toBe("season_unavailable");
    expect(row.timeline.map((e) => e.kind)).toContain("addition");
  });

  it("cross-checks names against the current source roster without asserting identity", () => {
    const players = [
      { id: "1", name: "J.P. Estrella", team_id: "130", team: "Michigan", previous_teams: [], status: "new_to_dataset", position: "F", class_year: null, height: null, weight: null, source_url: null, prior_production: null },
      { id: "2", name: "Twin Player", team_id: "130", team: "Michigan", previous_teams: [], status: "ambiguous", position: null, class_year: null, height: null, weight: null, source_url: null, prior_production: null },
      { id: "3", name: "Twin-Player", team_id: "130", team: "Michigan", previous_teams: [], status: "ambiguous", position: null, class_year: null, height: null, weight: null, source_url: null, prior_production: null },
    ];
    expect(rosterNameMatch("JP Estrella", "130", players)).toBe("exact");
    expect(rosterNameMatch("Missing Name", "130", players)).toBe("none");
    expect(rosterNameMatch("Twin Player", "130", players)).toBe("multiple");
  });
  it("prioritizes a same-day planned redshirt over the addition", () => {
    const row = recruitingRows(data).find((p) => p.name === "Lincoln Cosby")!;
    expect(row.latest.kind).toBe("redshirt_announced");
    expect(row.timeline).toHaveLength(2);
  });
  it("rolls dated source events into a chronological activity feed", () => {
    const activity = summarizeRecruitingActivity(data);
    expect(activity.events).toHaveLength(data.coverage.events);
    expect(activity.events[0].source.published_on >= activity.events.at(-1)!.source.published_on).toBe(true);
    expect(activity.months.reduce((total, month) => total + month.events, 0)).toBe(data.coverage.events);
    expect(activity.months.every((month) => month.players > 0 && month.programs > 0)).toBe(true);
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

  it("orders the review queue by evidence that needs attention", () => {
    const base = {
      team_id: "a",
      program: { name: "Alpha" },
      previous_program: null,
      category: "transfer" as const,
      timeline: [],
    };
    const row = (name: string, kind: string, stats: { mpg: number; ppg: number } | null) => ({
      ...base,
      name,
      stats,
      latest: { kind, source: { published_on: "2026-04-01" } },
    });
    const sorted = sortRecruitingReviewRows(
      [row("No stats", "addition", null), row("Needs review", "season_unavailable", { mpg: 10, ppg: 4 }), row("Exact handoff", "addition", { mpg: 20, ppg: 8 })],
      (value) => value.name === "Exact handoff" ? "exact" : "none",
    );
    expect(sorted.map((value) => value.name)).toEqual(["Needs review", "Exact handoff", "No stats"]);
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

describe("incoming and returning production bridge", () => {
  it("keeps exact IDs and unavailable production visible across the two evidence sets", () => {
    const release: RecruitingRelease = {
      ...data,
      programs: [
        { id: "a", name: "Alpha", host: "", publisher: "" },
        { id: "b", name: "Beta", host: "", publisher: "" },
      ],
      people: [
        { key: "a-low", name: "Lower Workload", team_id: "a", category: "transfer", previous_program: "Old A", stats: { ...stat(18, 9), id: "101", team_id: "10", team: "Old A" } },
        { key: "a-high", name: "Higher Workload", team_id: "a", category: "transfer", previous_program: "Old B", stats: { ...stat(31, 15), id: "102", team_id: "11", team: "Old B" } },
        { key: "b-missing", name: "No Prior File", team_id: "b", category: "freshman", previous_program: null, stats: null },
      ],
      sources: [
        { id: "s1", team_id: "a", url: "", title: "A", publisher: "", published_on: "2026-05-01", date_basis: "", checked_at: "", review_note: null },
        { id: "s2", team_id: "b", url: "", title: "B", publisher: "", published_on: "2026-05-02", date_basis: "", checked_at: "", review_note: null },
      ],
      events: [
        { id: "e1", person_key: "a-low", kind: "addition", source_id: "s1", summary: "" },
        { id: "e2", person_key: "a-high", kind: "addition", source_id: "s1", summary: "" },
        { id: "e3", person_key: "b-missing", kind: "addition", source_id: "s2", summary: "" },
      ],
    };
    const rosterPlayer = (id: string, status: string, mpg: number) => ({
      id,
      name: `Roster ${id}`,
      team_id: "a",
      team: "Alpha",
      previous_teams: ["Alpha"],
      status,
      position: "G",
      class_year: "Junior",
      height: null,
      weight: null,
      source_url: null,
      prior_production: { games: 20, minutes: mpg * 20, mpg, ppg: mpg / 2, rpg: 4, apg: 3, ts: null, box_bpm: null, teams: ["Alpha"] },
    });
    const rosters: BBRosters = {
      season: 2027,
      previous_season: 2026,
      teams_observed: 1,
      players_observed: 3,
      prior_players_not_observed: 0,
      status_counts: {},
      players: [
        rosterPlayer("201", "same_program", 27),
        rosterPlayer("202", "same_program", 12),
        rosterPlayer("203", "different_program", 38),
      ],
    };

    const rows = recruitingRosterProductionComparisons(release, rosters);
    expect(rows.map((row) => row.team_name)).toEqual(["Alpha", "Beta"]);
    expect(rows[0]).toMatchObject({
      incoming_players: 2,
      incoming_linked: 2,
      returning_players: 2,
      returning_linked: 2,
      incoming: { name: "Higher Workload", player_id: "102", prior_team_id: "11", mpg: 31 },
      returning: { name: "Roster 201", player_id: "201", prior_team_id: "a", mpg: 27 },
    });
    expect(rows[1]).toMatchObject({
      incoming_players: 1,
      incoming_linked: 0,
      returning_players: 0,
      returning_linked: 0,
      incoming: { name: "No Prior File", player_id: null, mpg: null },
      returning: null,
    });
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

  it("round-trips shareable coverage-map filters", () => {
    const search = recruitingFilterSearch(
      { team: "all", q: "", kind: "all", sort: "latest" },
      { query: "North Carolina", sort: "prior", status: "unreviewed" },
    );
    expect(search).toBe(
      "?coverageQ=North+Carolina&coverageSort=prior&coverageStatus=unreviewed",
    );
    expect(parseRecruitingCoverageFilters(search)).toEqual({
      query: "North Carolina",
      sort: "prior",
      status: "unreviewed",
    });
  });

  it("falls back for unsupported coverage controls", () => {
    expect(parseRecruitingCoverageFilters("?coverageSort=bad&coverageStatus=bad")).toEqual({
      query: "",
      sort: "reviewed",
      status: "all",
    });
  });

  it("round-trips the workload review priority sort", () => {
    const search = recruitingFilterSearch(
      { team: "all", q: "", kind: "all", sort: "latest" },
      { query: "", sort: "unrepresented", status: "unreviewed" },
    );
    expect(search).toBe("?coverageSort=unrepresented&coverageStatus=unreviewed");
    expect(parseRecruitingCoverageFilters(search).sort).toBe("unrepresented");
  });
});
