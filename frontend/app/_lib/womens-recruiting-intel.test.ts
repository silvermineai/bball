import { describe, expect, it } from "vitest";
import release from "../../public/data/basketball/womens-recruiting.json";
import { rankWomensObservedPlayers, rankWomensRecruitingProspects, summarizeWomensRecruitingProspects, validateWomensRecruitingHistory, validateWomensRecruitingRelease, womensRecruitingGradeBands, womensRecruitingPositionSupply, womensRecruitingProspectCsvHeaders, womensRecruitingProspectCsvRows, womensRecruitingRankCoverage } from "./womens-recruiting-intel";

const player = (overrides: Partial<Parameters<typeof rankWomensObservedPlayers>[0][number]> = {}) => ({
  player_id: "p-1",
  name: "A Player",
  team: "A College",
  position: "G",
  stats: { avgPoints: 18, avgRebounds: 4, avgAssists: 3, avgMinutes: 30 },
  ...overrides,
});

const source = (recordCount: number) => ({
  publisher: "ESPN",
  league: "womens-college-basketball",
  list_url: "https://sports.core.api.espn.com/v2/sports/basketball/leagues/womens-college-basketball/seasons/2027/recruits?limit=200",
  list_sha256: "c".repeat(64),
  detail_url_template: "https://sports.core.api.espn.com/v2/sports/basketball/leagues/womens-college-basketball/recruits/{athlete_id}?lang=en&region=us",
  receipt_count: recordCount + 1,
});

const sourceFields = (athleteId: string, capturedAt = "2026-09-22T04:10:24.839220Z") => ({
  source_sha256: "d".repeat(64),
  source_url: `https://sports.core.api.espn.com/v2/sports/basketball/leagues/womens-college-basketball/recruits/${athleteId}?lang=en&region=us`,
  recruiting_class: 2027,
  captured_at: capturedAt,
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

  it("groups source grades while keeping missing grades separate", () => {
    expect(womensRecruitingGradeBands([
      { athlete_id: "1", name: "A", grade: 100 },
      { athlete_id: "2", name: "B", grade: 95 },
      { athlete_id: "3", name: "C", grade: 94.9 },
      { athlete_id: "4", name: "D", grade: 80 },
      { athlete_id: "5", name: "E", grade: 79.9 },
      { athlete_id: "6", name: "F", grade: null },
    ])).toEqual([
      { label: "95–100", minimum: 95, maximum: 100, prospects: 2, share: 2 / 6 },
      { label: "90–94.9", minimum: 90, maximum: 94.999999, prospects: 1, share: 1 / 6 },
      { label: "80–89.9", minimum: 80, maximum: 89.999999, prospects: 1, share: 1 / 6 },
      { label: "Below 80", minimum: null, maximum: 79.999999, prospects: 1, share: 1 / 6 },
      { label: "Grade unavailable", minimum: null, maximum: null, prospects: 1, share: 1 / 6 },
    ]);
    expect(womensRecruitingGradeBands([]).every((band) => band.share === null)).toBe(true);
  });

  it("exports validated prospect fields without filling missing ranks or destinations", () => {
    const records = [{
      athlete_id: "17",
      name: "A Prospect",
      grade: 92,
      rank: null,
      status: "Undecided",
      committed_team_id: null,
      high_school: "North High",
    }];
    expect(womensRecruitingProspectCsvHeaders).toContain("national_rank");
    expect(womensRecruitingProspectCsvRows(records, 2027)[0]).toEqual([
      "17", "A Prospect", 2027, null, null, null, null, null, 92, "Undecided", null, null, "North High", null,
    ]);
  });

  it("preserves source dimensional ranks and reports each rank cohort separately", () => {
    const records = [{ athlete_id: "17", name: "A Prospect", rank: 42, position_rank: 7, state_rank: 3, region_rank: 12, grade: 92 }];
    expect(womensRecruitingRankCoverage(records)).toEqual({ national: 1, position: 1, state: 1, region: 1 });
    expect(womensRecruitingProspectCsvHeaders).toContain("region_rank");
    expect(womensRecruitingProspectCsvRows(records, 2027)[0].slice(3, 9)).toEqual([null, 42, 7, 3, 12, 92]);
    const sourceRelease = {
      schema_version: 1, sport: "basketball", gender: "women", season: 2027, edition: "f".repeat(64),
      captured_at: "2026-09-22T04:10:24.839220Z", source: source(1), coverage: { prospects: 1, graded: 1, ranked: 1, committed: 0 },
      records: [{ athlete_id: "101", name: "A", grade: 92, rank: 42, position_rank: 7, state_rank: 3, region_rank: 12, ...sourceFields("101") }],
    };
    expect(validateWomensRecruitingRelease(sourceRelease)?.records[0]).toMatchObject({ rank: 42, position_rank: 7, state_rank: 3, region_rank: 12 });
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

  it("summarizes position supply without promoting verbal status to a destination", () => {
    const rows = womensRecruitingPositionSupply([
      { athlete_id: "1", name: "A", position: "SG", status: "Verbal", committed_team_id: null },
      { athlete_id: "2", name: "B", position: "SG", status: "Undecided", committed_team_id: "20" },
      { athlete_id: "3", name: "C", position: "PG", status: "Verbal", committed_team_id: null },
      { athlete_id: "4", name: "D", position: null, status: null, committed_team_id: null },
    ]);
    expect(rows).toEqual([
      {
        position: "SG",
        prospects: 2,
        destinationIds: 1,
        statuses: [{ status: "Undecided", prospects: 1 }, { status: "Verbal", prospects: 1 }],
      },
      { position: "PG", prospects: 1, destinationIds: 0, statuses: [{ status: "Verbal", prospects: 1 }] },
      { position: "Position unavailable", prospects: 1, destinationIds: 0, statuses: [{ status: "Status unavailable", prospects: 1 }] },
    ]);
    expect(womensRecruitingPositionSupply([
      { athlete_id: "1", name: "A", position: "SG" },
      { athlete_id: "1", name: "Duplicate", position: "PG" },
    ])).toEqual([]);
  });

  it("admits a receipt-backed complete release when counts and IDs reconcile", () => {
    const release = validateWomensRecruitingRelease({
      schema_version: 1,
      sport: "basketball",
      gender: "women",
      season: 2027,
      edition: "a".repeat(64),
      captured_at: "2026-09-22T04:10:24.839220Z",
      source: source(2),
      coverage: { prospects: 2, graded: 1, ranked: 1, committed: 0 },
      records: [
        { athlete_id: "101", name: "A", grade: 92, rank: 4, committed_team_id: null, ...sourceFields("101") },
        { athlete_id: "102", name: "B", grade: null, rank: null, committed_team_id: null, ...sourceFields("102") },
      ],
    });
    expect(release?.records.map((row) => row.athlete_id)).toEqual(["101", "102"]);
    expect(release?.coverage).toEqual({ prospects: 2, graded: 1, ranked: 1, committed: 0 });
  });

  it("withholds a truncated, duplicated, or count-mismatched release", () => {
    const base = {
      schema_version: 1,
      sport: "basketball",
      gender: "women",
      season: 2027,
      edition: "b".repeat(64),
      captured_at: "2026-09-22T04:10:24.839220Z",
      source: source(2),
      coverage: { prospects: 2, graded: 2, ranked: 0, committed: 0 },
      records: [
        { athlete_id: "101", name: "A", grade: 92, ...sourceFields("101") },
        { athlete_id: "102", name: "B", grade: 90, ...sourceFields("102") },
      ],
    };
    expect(validateWomensRecruitingRelease(base)?.records).toHaveLength(2);
    expect(validateWomensRecruitingRelease({ ...base, records: base.records.slice(0, 1) })).toBeNull();
    expect(validateWomensRecruitingRelease({ ...base, records: [{ ...base.records[0] }, { ...base.records[0] }] })).toBeNull();
    expect(validateWomensRecruitingRelease({ ...base, coverage: { ...base.coverage, graded: 1 } })).toBeNull();
    expect(validateWomensRecruitingRelease({ ...base, edition: "not-a-digest" })).toBeNull();
  });

  it("rejects an impossible source grade instead of ranking it", () => {
    const base = {
      schema_version: 1,
      sport: "basketball",
      gender: "women",
      season: 2027,
      edition: "c".repeat(64),
      captured_at: "2026-09-22T04:10:24.839220Z",
      source: source(1),
      coverage: { prospects: 1, graded: 1, ranked: 0, committed: 0 },
      records: [{ athlete_id: "101", name: "A", grade: 100, ...sourceFields("101") }],
    };
    expect(validateWomensRecruitingRelease(base)).not.toBeNull();
    expect(validateWomensRecruitingRelease({
      ...base,
      records: [{ ...base.records[0], grade: 100.01 }],
    })).toBeNull();
  });

  it("rejects a release whose receipt count or row source URL does not reconcile", () => {
    const base = {
      schema_version: 1,
      sport: "basketball",
      gender: "women",
      season: 2027,
      edition: "e".repeat(64),
      captured_at: "2026-09-22T04:10:24.839220Z",
      source: source(1),
      coverage: { prospects: 1, graded: 1, ranked: 0, committed: 0 },
      records: [{ athlete_id: "101", name: "A", grade: 92, ...sourceFields("101") }],
    };
    expect(validateWomensRecruitingRelease({ ...base, source: { ...base.source, receipt_count: 1 } })).toBeNull();
    expect(validateWomensRecruitingRelease({ ...base, records: [{ ...base.records[0], source_url: "https://example.test/recruit/101" }] })).toBeNull();
    expect(validateWomensRecruitingRelease({ ...base, records: [{ ...base.records[0], captured_at: "2026-09-22T04:10:24.839221Z" }] })).toBeNull();
  });

  it("rejects an ESPN-labelled release whose receipts use another host", () => {
    const base = {
      schema_version: 1,
      sport: "basketball",
      gender: "women",
      season: 2027,
      edition: "f".repeat(64),
      captured_at: "2026-09-22T04:10:24.839220Z",
      source: source(1),
      coverage: { prospects: 1, graded: 1, ranked: 0, committed: 0 },
      records: [{ athlete_id: "101", name: "A", grade: 92, ...sourceFields("101") }],
    };
    const spoofedHost = "example.test";
    const spoofedList = base.source.list_url.replace("sports.core.api.espn.com", spoofedHost);
    const spoofedTemplate = base.source.detail_url_template.replace("sports.core.api.espn.com", spoofedHost);
    const spoofedRecord = base.records[0].source_url.replace("sports.core.api.espn.com", spoofedHost);
    expect(validateWomensRecruitingRelease({
      ...base,
      source: { ...base.source, list_url: spoofedList, detail_url_template: spoofedTemplate },
      records: [{ ...base.records[0], source_url: spoofedRecord }],
    })).toBeNull();
  });

  it("validates multi-class history only when class boundaries and totals reconcile", () => {
    const makeRelease = (season: number, edition: string) => ({
      schema_version: 1,
      sport: "basketball",
      gender: "women",
      season,
      edition,
      captured_at: "2026-09-22T04:10:24.839220Z",
      source: {
        ...source(1),
        list_url: source(1).list_url.replace("/seasons/2027/", `/seasons/${season}/`),
      },
      coverage: { prospects: 1, graded: 1, ranked: 0, committed: 0 },
      records: [{ athlete_id: String(season), name: "A", grade: 92, ...sourceFields(String(season)) , recruiting_class: season }],
    });
    const history = validateWomensRecruitingHistory({
      schema_version: 1,
      sport: "basketball",
      gender: "women",
      classes: [2026, 2027],
      edition: "a".repeat(64),
      captured_at: "2026-09-22T04:10:24.839220Z",
      coverage: { seasons: 2, prospects: 2, graded: 2, ranked: 0, committed: 0 },
      releases: [makeRelease(2026, "b".repeat(64)), makeRelease(2027, "c".repeat(64))],
    });
    expect(history?.classes).toEqual([2026, 2027]);
    expect(validateWomensRecruitingHistory({ ...history, coverage: { ...history!.coverage, prospects: 1 } })).toBeNull();
    expect(validateWomensRecruitingHistory({ ...history, classes: [2027, 2026] })).toBeNull();
  });
});
