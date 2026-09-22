import { describe, expect, it } from "vitest";
import release from "../../public/data/basketball/womens-recruiting.json";
import { rankWomensObservedPlayers, rankWomensRecruitingProspects, summarizeWomensRecruitingProspects, validateWomensRecruitingRelease } from "./womens-recruiting-intel";

const player = (overrides: Partial<Parameters<typeof rankWomensObservedPlayers>[0][number]> = {}) => ({
  player_id: "p-1",
  name: "A Player",
  team: "A College",
  position: "G",
  stats: { avgPoints: 18, avgRebounds: 4, avgAssists: 3, avgMinutes: 30 },
  ...overrides,
});

describe("women's recruiting production context", () => {
  it("sorts source rows by the selected production field and preserves missingness", () => {
    const rows = rankWomensObservedPlayers([
      player({ player_id: "p-2", name: "B Player", stats: { avgPoints: 22 } }),
      player({ player_id: "p-3", name: "C Player", stats: { avgPoints: null } }),
      player({ player_id: "p-1", name: "A Player", stats: { avgPoints: 18 } }),
    ], "avgPoints", 3);
    expect(rows.map((row) => [row.name, row.metricValue])).toEqual([
      ["B Player", 22],
      ["A Player", 18],
      ["C Player", null],
    ]);
  });

  it("uses a stable name and ID tie break without assigning a rank to a missing value", () => {
    const rows = rankWomensObservedPlayers([
      player({ player_id: "p-2", name: "Same Name", stats: { avgAssists: 5 } }),
      player({ player_id: "p-1", name: "Same Name", stats: { avgAssists: 5 } }),
      player({ player_id: "p-3", name: "Missing", stats: {} }),
    ], "avgAssists", 2);
    expect(rows.map((row) => row.player_id)).toEqual(["p-1", "p-2"]);
    expect(rankWomensObservedPlayers([player({ stats: {} })], "avgAssists")[0].metricValue).toBeNull();
  });
});

describe("women's recruiting prospect cohort", () => {
  it("accepts the checked-in release receipt and full source row count", () => {
    const validated = validateWomensRecruitingRelease(release);
    expect(validated?.records).toHaveLength(release.coverage.prospects);
    expect(validated?.edition).toBe(release.edition);
    expect(validated?.coverage).toEqual(release.coverage);
  });

  it("sorts observed grades and filters exact retained fields", () => {
    const rows = rankWomensRecruitingProspects([
      { athlete_id: "2", name: "B", grade: 88, high_school: "North" },
      { athlete_id: "1", name: "A", grade: 93, high_school: "South" },
      { athlete_id: "3", name: "C", grade: null, high_school: "North" },
    ], "north", 5);
    expect(rows.map((row) => row.athlete_id)).toEqual(["2", "3"]);
    expect(rows[1].grade).toBeNull();
  });

  it("summarizes source statuses without turning verbal labels into destinations", () => {
    const rows = summarizeWomensRecruitingProspects([
      { athlete_id: "1", name: "A", grade: 95, status: "Verbal", committed_team_id: null },
      { athlete_id: "2", name: "B", grade: 90, status: "Undecided", committed_team_id: null },
      { athlete_id: "3", name: "C", grade: null, status: "Verbal", committed_team_id: "7" },
    ]);
    expect(rows).toEqual([
      { status: "Verbal", prospects: 2, graded: 1, averageGrade: 95, exactIds: 2, destinationIds: 1 },
      { status: "Undecided", prospects: 1, graded: 1, averageGrade: 90, exactIds: 1, destinationIds: 0 },
    ]);
  });

  it("fails closed on blank or duplicate prospect IDs", () => {
    expect(summarizeWomensRecruitingProspects([{ athlete_id: "", name: "Missing" }])).toEqual([]);
    expect(summarizeWomensRecruitingProspects([
      { athlete_id: "1", name: "A" },
      { athlete_id: "1", name: "Duplicate" },
    ])).toEqual([]);
  });

  it("admits a receipt-backed complete release when counts and IDs reconcile", () => {
    const release = validateWomensRecruitingRelease({
      edition: "a".repeat(64),
      captured_at: "2026-09-22T04:10:24.839220Z",
      coverage: { prospects: 2, graded: 1, ranked: 1, committed: 0 },
      records: [
        { athlete_id: "101", name: "A", grade: 92, rank: 4, committed_team_id: null },
        { athlete_id: "102", name: "B", grade: null, rank: null, committed_team_id: null },
      ],
    });
    expect(release?.records.map((row) => row.athlete_id)).toEqual(["101", "102"]);
    expect(release?.coverage).toEqual({ prospects: 2, graded: 1, ranked: 1, committed: 0 });
  });

  it("withholds a truncated, duplicated, or count-mismatched release", () => {
    const base = {
      edition: "b".repeat(64),
      captured_at: "2026-09-22T04:10:24.839220Z",
      coverage: { prospects: 2, graded: 2, ranked: 0, committed: 0 },
      records: [
        { athlete_id: "101", name: "A", grade: 92 },
        { athlete_id: "102", name: "B", grade: 90 },
      ],
    };
    expect(validateWomensRecruitingRelease(base)?.records).toHaveLength(2);
    expect(validateWomensRecruitingRelease({ ...base, records: base.records.slice(0, 1) })).toBeNull();
    expect(validateWomensRecruitingRelease({ ...base, records: [{ ...base.records[0] }, { ...base.records[0] }] })).toBeNull();
    expect(validateWomensRecruitingRelease({ ...base, coverage: { ...base.coverage, graded: 1 } })).toBeNull();
    expect(validateWomensRecruitingRelease({ ...base, edition: "not-a-digest" })).toBeNull();
  });
});
