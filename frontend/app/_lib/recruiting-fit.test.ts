import { describe, expect, it } from "vitest";
import { buildRecruitingFit, buildRoleSummaries, parseRecruitingFitRosterPayload, positionRole, prioritizeRoleSummaries, recruitingFitCoverage, recruitingFitSourceReceipt } from "./recruiting-fit";
import type { BBRoster } from "./basketball-types";

const player = (patch: Partial<BBRoster>): BBRoster => ({
  id: patch.id || Math.random().toString(), name: patch.name || "Player", team_id: patch.team_id || "1", team: patch.team || "Team", previous_teams: [], status: "different_program", position: "G", class_year: "Junior", height: null, weight: null, source_url: null, prior_production: { games: 25, minutes: 700, mpg: 28, ppg: 14, rpg: 4, apg: 5, spg: 1, bpg: 0.2, efg: 0.5, ts: 0.55, teams: ["Team"] }, ...patch,
});

describe("recruiting fit", () => {
  const liveRoster = (patch: Record<string, unknown> = {}) => ({
    season: 2027,
    previous_season: 2026,
    teams_observed: 1,
    players_observed: 1,
    prior_players_not_observed: 0,
    status_counts: { same_program: 1 },
    players: [{ id: "source-42", name: "Source Player", team_id: "team-7", team: "Source Team", previous_teams: [], status: "same_program", position: "G", class_year: null, height: null, weight: null, source_url: null, prior_production: null }],
    source: { dataset: "rosters", url: null, fetched_at: null, sha256: null },
    ...patch,
  });

  it("accepts a complete roster edition and preserves source IDs", () => {
    const parsed = parseRecruitingFitRosterPayload(liveRoster());
    expect(parsed?.players[0]).toMatchObject({ id: "source-42", team_id: "team-7" });
    expect(parsed?.source?.dataset).toBe("rosters");
  });

  it("withholds malformed or duplicate source rows instead of changing the fit denominator", () => {
    expect(parseRecruitingFitRosterPayload(liveRoster({ season: 2026 }))).toBeNull();
    expect(parseRecruitingFitRosterPayload(liveRoster({ players: [liveRoster().players[0], liveRoster().players[0]] }))).toBeNull();
    expect(parseRecruitingFitRosterPayload(liveRoster({ source: { dataset: "rosters", url: null, fetched_at: null, sha256: "bad" } }))).toBeNull();
    expect(parseRecruitingFitRosterPayload(liveRoster({ players: [{ ...liveRoster().players[0], name: "" }] }))).toBeNull();
  });

  it("normalizes only a complete roster receipt and exposes row-level production coverage", () => {
    const digest = "A".repeat(64);
    const roster = liveRoster({
      teams_observed: 3,
      players: [
        { ...liveRoster().players[0], prior_production: { games: 10, minutes: 200, teams: ["Prior Team"] } },
        { ...liveRoster().players[0], id: "source-43", prior_production: null },
      ],
      source: { dataset: "rosters", url: null, fetched_at: "2026-09-20T12:00:00Z", sha256: digest },
    });
    const parsed = parseRecruitingFitRosterPayload(roster);
    expect(parsed).not.toBeNull();
    expect(recruitingFitSourceReceipt(parsed!)).toEqual({ dataset: "rosters", fetchedAt: "2026-09-20T12:00:00Z", sha256: digest.toLowerCase() });
    expect(recruitingFitCoverage(parsed!)).toEqual({ listedPlayers: 2, priorProductionRows: 1, priorProductionMissing: 1, teamsObserved: 3 });
    expect(recruitingFitSourceReceipt({ ...parsed!, source: { ...parsed!.source!, sha256: "bad" } })).toBeNull();
  });

  it("normalizes source positions into coach roles", () => {
    expect(positionRole("PG")).toBe("guard");
    expect(positionRole("SF")).toBe("wing");
    expect(positionRole("C")).toBe("big");
    expect(positionRole(null)).toBe("unknown");
  });

  it("keeps the target roster out of the candidate board and ranks qualified candidates", () => {
    const rows = [
      player({ id: "target", team_id: "target", status: "same_program", name: "Target" }),
      player({ id: "a", team_id: "2", name: "Creator A", prior_production: { games: 30, minutes: 900, mpg: 30, ppg: 18, rpg: 4, apg: 8, spg: 1, bpg: 0, efg: 0.56, ts: 0.61, teams: ["A"] } }),
      player({ id: "b", team_id: "3", name: "Creator B", prior_production: { games: 30, minutes: 500, mpg: 17, ppg: 10, rpg: 3, apg: 2, spg: 0.5, bpg: 0, efg: 0.48, ts: 0.51, teams: ["B"] } }),
    ];
    const result = buildRecruitingFit(rows, { teamId: "target", role: "guard", focus: "creation", minimumMinutes: 400 });
    expect(result.map((row) => row.player.id)).toEqual(["a", "b"]);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("keeps cohort rank and denominator stable when a name filter hides candidates", () => {
    const rows = [
      player({ id: "target", team_id: "target", status: "same_program" }),
      player({ id: "a", name: "Lead Creator", team_id: "2", prior_production: { games: 30, minutes: 900, mpg: 30, ppg: 18, rpg: 4, apg: 8, spg: 1, bpg: 0, teams: ["A"] } }),
      player({ id: "b", name: "Other Creator", team_id: "3", prior_production: { games: 30, minutes: 500, mpg: 17, ppg: 10, rpg: 3, apg: 2, spg: 0.5, bpg: 0, teams: ["B"] } }),
    ];
    const full = buildRecruitingFit(rows, { teamId: "target", role: "guard", focus: "creation", minimumMinutes: 400 });
    const filtered = buildRecruitingFit(rows, { teamId: "target", role: "guard", focus: "creation", minimumMinutes: 400, query: "other" });
    expect(full.map((row) => row.cohortRank)).toEqual([1, 2]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ player: { id: "b" }, cohortRank: 2, cohortTotal: 2 });
  });

  it("reports how much of the selected skill evidence is available", () => {
    const result = buildRecruitingFit([
      player({ id: "target", team_id: "target" }),
      player({ id: "complete", team_id: "2", prior_production: { games: 25, minutes: 700, mpg: 28, ppg: 14, rpg: 4, apg: 5, efg: 0.55, ts: 0.6, ft_pct: 0.82, teams: ["A"] } }),
      player({ id: "partial", team_id: "3", prior_production: { games: 25, minutes: 700, mpg: 28, ppg: 14, rpg: 4, apg: 5, efg: 0.55, ts: 0.6, teams: ["B"] } }),
    ], { teamId: "target", role: "any", focus: "shooting", minimumMinutes: 400 });
    expect(result.find((row) => row.player.id === "complete")).toMatchObject({ skillComponents: 3, skillComponentTotal: 3 });
    expect(result.find((row) => row.player.id === "partial")).toMatchObject({ skillComponents: 2, skillComponentTotal: 3 });
  });

  it("scores rebounding from offensive and defensive components", () => {
    const result = buildRecruitingFit([
      player({ id: "target", team_id: "target" }),
      player({ id: "two-way", team_id: "2", prior_production: { games: 25, minutes: 700, mpg: 28, ppg: 10, rpg: 8, orpg: 3, drpg: 5, apg: 2, teams: ["A"] } }),
      player({ id: "offensive", team_id: "3", prior_production: { games: 25, minutes: 700, mpg: 28, ppg: 10, rpg: 8, orpg: 5, drpg: 3, apg: 2, teams: ["B"] } }),
      player({ id: "legacy", team_id: "4", prior_production: { games: 25, minutes: 700, mpg: 28, ppg: 10, rpg: 8, apg: 2, teams: ["C"] } }),
    ], { teamId: "target", role: "any", focus: "rebounding", minimumMinutes: 400 });
    expect(result.find((row) => row.player.id === "two-way")).toMatchObject({ skillComponents: 3, skillComponentTotal: 3, primaryValue: 3, skillBreakdown: [
      { key: "orpg", value: 3, percentile: 0, weight: 0.4 },
      { key: "drpg", value: 5, percentile: 100, weight: 0.4 },
      { key: "mpg", value: 28, percentile: 0, weight: 0.2 },
    ] });
    expect(result.find((row) => row.player.id === "legacy")).toMatchObject({ skillComponents: 1, skillComponentTotal: 3, primaryValue: null });
    expect(result.map((row) => row.player.id)).toContain("offensive");
  });

  it("summarizes returning and incoming workload by role", () => {
    const result = buildRoleSummaries([
      player({ team_id: "target", position: "C", status: "same_program", prior_production: { games: 20, minutes: 600, mpg: 30, ppg: 10, rpg: 8, apg: 2, teams: ["T"] } }),
      player({ team_id: "target", position: "C", status: "different_program", prior_production: { games: 20, minutes: 300, mpg: 15, ppg: 6, rpg: 4, apg: 1, teams: ["X"] } }),
    ], "target");
    expect(result.find((row) => row.role === "big")).toMatchObject({ listed: 2, priorMinutes: 900, returningMinutes: 600, incomingMinutes: 300, unclassifiedMinutes: 0, returningShare: 2 / 3, incomingShare: 1 / 3, unclassifiedShare: 0 });
  });

  it("keeps ambiguous workload visible instead of assigning it to movement", () => {
    const result = buildRoleSummaries([
      player({ team_id: "target", position: "G", status: "ambiguous", prior_production: { games: 20, minutes: 240, mpg: 12, ppg: 6, rpg: 2, apg: 1, teams: ["T"] } }),
    ], "target");
    expect(result.find((row) => row.role === "guard")).toMatchObject({ priorMinutes: 240, returningMinutes: 0, incomingMinutes: 0, unclassifiedMinutes: 240, unclassifiedShare: 1 });
  });

  it("prioritizes the role with the most unclassified workload", () => {
    const summaries = buildRoleSummaries([
      player({ team_id: "target", position: "G", status: "ambiguous", prior_production: { games: 20, minutes: 300, mpg: 15, ppg: 6, rpg: 2, apg: 1, teams: ["T"] } }),
      player({ team_id: "target", position: "C", status: "ambiguous", prior_production: { games: 20, minutes: 700, mpg: 35, ppg: 12, rpg: 8, apg: 2, teams: ["T"] } }),
    ], "target");
    expect(prioritizeRoleSummaries(summaries).map((summary) => summary.role)).toEqual(["big", "guard", "wing"]);
  });
});
