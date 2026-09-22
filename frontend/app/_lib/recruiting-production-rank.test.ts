import { describe, expect, it } from "vitest";
import { auditRecruitingDestinationRoster, rankRecruitingProduction, summarizeRecruitingDestinationProduction } from "./recruiting-production-rank";
import type { RecruitingPerson } from "./recruiting";
import release from "../../public/data/basketball/recruiting.json";

const person = (overrides: Partial<RecruitingPerson> = {}): RecruitingPerson => ({
  key: "1-player",
  name: "A Player",
  team_id: "1",
  category: "transfer",
  previous_program: "Old College",
  stats: {
    id: "1001",
    team_id: "2",
    team: "Old College",
    season: 2026,
    games: 30,
    mpg: 30,
    ppg: 18,
    rpg: 7,
    apg: 4,
    spg: 1.2,
    bpg: 0.5,
    topg: 2,
    efg: 0.55,
    ts: 0.58,
    three_pct: 0.35,
    ft_pct: 0.75,
    ft_rate: 0.25,
    three_rate: 0.4,
    tov_rate: 0.14,
    incomplete_box_games: 0,
    identity_basis: "exact review",
  },
  ...overrides,
});

describe("recruiting production rank", () => {
  it("admits the retained release only through its exact numeric source IDs", () => {
    const rows = rankRecruitingProduction(release.people as RecruitingPerson[]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => /^\d{1,15}$/.test(row.stats.id))).toBe(true);
    expect(new Set(rows.map((row) => row.stats.id)).size).toBe(rows.length);
  });

  it("ranks eligible transfer production within the retained cohort", () => {
    const rows = rankRecruitingProduction([
      person(),
      person({ key: "1-player-b", name: "B Player", stats: { ...person().stats!, id: "1002", mpg: 18, ppg: 10, rpg: 2, apg: 1, spg: 0.2, ts: 0.44 } }),
      person({ key: "1-player-c", name: "C Player", stats: null }),
      person({ key: "1-player-d", name: "D Player", category: "freshman" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].person.name).toBe("A Player");
    expect(rows[0].score).not.toBeNull();
    expect(rows[0].availableFields).toBe(8);
  });

  it("keeps every eligible exact-ID row available to the full ranking table", () => {
    const rows = rankRecruitingProduction([
      person(),
      person({ key: "1-player-b", name: "B Player", stats: { ...person().stats!, id: "1002", mpg: 18, ppg: 10, rpg: 2, apg: 1, spg: 0.2, ts: 0.44 } }),
      person({ key: "1-player-c", name: "C Player", stats: { ...person().stats!, id: "1003", mpg: 12, ppg: 6, rpg: 1, apg: 1, spg: 0.1, ts: 0.4 } }),
    ]);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.stats.id))).toEqual(new Set(["1001", "1002", "1003"]));
    expect(rows.map((row) => row.person.name)).toEqual(["A Player", "B Player", "C Player"]);
  });

  it("does not turn missing source fields into zeroes", () => {
    const rows = rankRecruitingProduction([
      person(),
      person({ key: "1-player-b", name: "B Player", stats: { ...person().stats!, id: "1002", apg: null, rpg: null, spg: null, bpg: null, ts: null, efg: null } }),
    ]);
    const missing = rows.find((row) => row.person.name === "B Player")!;
    expect(missing.availableFields).toBe(2);
    expect(missing.score).toBeNull();
  });

  it("withholds the board when exact source IDs are duplicated", () => {
    expect(rankRecruitingProduction([
      person(),
      person({ key: "1-player-b", name: "B Player" }),
    ])).toEqual([]);
  });

  it("withholds identity collisions and malformed IDs below the ranking floor", () => {
    expect(rankRecruitingProduction([
      person(),
      person({ key: "1-player-b", name: "B Player", stats: { ...person().stats!, games: 9 } }),
    ])).toEqual([]);
    expect(rankRecruitingProduction([
      person(),
      person({ key: "1-player-b", name: "B Player", stats: { ...person().stats!, id: "not-a-source-id", games: 9 } }),
    ])).toEqual([]);
  });

  it("rolls exact-ID production up to destinations with game-weighted rates", () => {
    const rows = summarizeRecruitingDestinationProduction([
      person(),
      person({ key: "1-player-b", name: "B Player", stats: { ...person().stats!, id: "1002", ppg: 10, mpg: 18, rpg: 2, apg: 1, spg: 0.2, ts: 0.44 } }),
      person({ key: "3-player-c", name: "C Player", team_id: "3", stats: { ...person().stats!, id: "1003", ppg: 20, mpg: 20 } }),
    ]);
    expect(rows.map((row) => row.teamId)).toEqual(["1", "3"]);
    expect(rows[0]).toMatchObject({ additions: 2, priorPrograms: 1, games: 60, weightedPpg: 14 });
    expect(rows[0].weightedTs).toBeCloseTo((0.58 * 30 + 0.44 * 30) / 60);
  });

  it("audits source-listed roster location without inferring a transfer outcome", () => {
    const rows = [
      person(),
      person({ key: "1-player-b", name: "B Player", stats: { ...person().stats!, id: "1002", ppg: 10, mpg: 18, rpg: 2, apg: 1, spg: 0.2, ts: 0.44 } }),
      person({ key: "3-player-c", name: "C Player", team_id: "3", stats: { ...person().stats!, id: "1003", ppg: 20, mpg: 20 } }),
      person({ key: "3-player-d", name: "D Player", team_id: "3", stats: { ...person().stats!, id: "1004", ppg: 12, mpg: 20 } }),
    ];
    const audits = auditRecruitingDestinationRoster(rows, {
      season: 2027,
      previous_season: 2026,
      teams_observed: 2,
      players_observed: 4,
      prior_players_not_observed: 0,
      status_counts: {},
      players: [
        { id: "1001", name: "A Player", team_id: "1", team: "A", previous_teams: [], status: "same_program", position: "G", class_year: null, height: null, weight: null, source_url: null },
        { id: "1002", name: "B Player", team_id: "9", team: "Elsewhere", previous_teams: [], status: "same_program", position: "G", class_year: null, height: null, weight: null, source_url: null },
        { id: "1003", name: "C Player", team_id: "3", team: "C", previous_teams: [], status: "same_program", position: "G", class_year: null, height: null, weight: null, source_url: null },
        { id: "1003", name: "C Player", team_id: "9", team: "Elsewhere", previous_teams: [], status: "ambiguous", position: "G", class_year: null, height: null, weight: null, source_url: null },
      ],
    });
    expect(audits).toEqual([
      { teamId: "1", incomingRows: 2, exactRosterIds: 2, atDestination: 1, elsewhere: 1, multiplePrograms: 0, notObserved: 0 },
      { teamId: "3", incomingRows: 2, exactRosterIds: 1, atDestination: 0, elsewhere: 0, multiplePrograms: 1, notObserved: 1 },
    ]);
  });
});
