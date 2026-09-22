import { describe, expect, it } from "vitest";
import {
  buildProgramRoleContext,
  combineProgramProspectClasses,
  isExactProgramProspect,
  loadProgramProspectClass,
  validProgramProspectReceipt,
  programProspectRankChange,
  programProspectRankChangeLabel,
  topProgramProspects,
  programProspectEvidence,
  PROGRAM_PROSPECT_CLASSES,
  summarizeProgramProspects,
  type ProgramProspect,
  type RecruitingClass,
} from "./ProgramProspects";
import type { RosterLabRow } from "../../../_lib/roster-readiness";

const prospect = (overrides: Partial<ProgramProspect> = {}): ProgramProspect => ({
  athlete_id: "1",
  name: "Example Prospect",
  position: "PG",
  rank: 20,
  grade: 94,
  status: null,
  committed_team_id: null,
  committed_team_name: null,
  school_ids: ["2755"],
  high_school: "Example Prep",
  hometown: "Example, CA",
  ...overrides,
});

const verifiedReceipt = (edition: string, capturedAt = "2026-09-01", sourceRows = 3) => ({
  dataset: "recruiting_rankings",
  captured_at: capturedAt,
  source_rows: sourceRows,
  sha256: edition,
  sha256_scope: "release_edition" as const,
  integrity: "verified" as const,
});

describe("program prospect evidence", () => {
  it("preserves exact prospect rank movement for program learning", () => {
    expect(programProspectRankChange({ rank: 12, previous_rank: 30 })).toBe(18);
    expect(programProspectRankChangeLabel({ rank: 12, previous_rank: 30 })).toBe("▲ 18");
    expect(programProspectRankChangeLabel({ rank: 30, previous_rank: 12 })).toBe("▼ 18");
    expect(programProspectRankChangeLabel({ rank: 12, previous_rank: 12 })).toBe("—");
    expect(programProspectRankChangeLabel({ rank: 12, previous_rank: null })).toBe("—");
    expect(programProspectRankChangeLabel({ rank: 0, previous_rank: 12 })).toBe("—");
  });

  it("selects the highest recorded ranks across classes before unranked rows", () => {
    const rows = [
      { ...prospect({ athlete_id: "old-low", name: "Old low", rank: 80 }), season: 2026, evidence: "Recorded commitment" as const },
      { ...prospect({ athlete_id: "new-high", name: "New high", rank: 4 }), season: 2027, evidence: "Listed school" as const },
      { ...prospect({ athlete_id: "mid", name: "Mid", rank: 20 }), season: 2025, evidence: "Committed elsewhere" as const },
      { ...prospect({ athlete_id: "placeholder", name: "Placeholder", rank: 0 }), season: 2025, evidence: "Listed school" as const },
      { ...prospect({ athlete_id: "missing", name: "Missing", rank: null }), season: 2025, evidence: "Listed school" as const },
    ];
    expect(topProgramProspects(rows, 3).map((row) => row.name)).toEqual(["New high", "Mid", "Old low"]);
    expect(topProgramProspects(rows, 0)).toEqual([]);
  });

  it("covers every retained national recruiting class", () => {
    expect(PROGRAM_PROSPECT_CLASSES).toEqual([2025, 2026, 2027, 2028, 2029, 2030]);
  });

  it("distinguishes commitments here, open school listings and commitments elsewhere", () => {
    expect(programProspectEvidence(prospect({ committed_team_id: "2755" }), "2755")).toBe("Recorded commitment");
    expect(programProspectEvidence(prospect(), "2755")).toBe("Listed school");
    expect(programProspectEvidence(prospect({ committed_team_id: "999", committed_team_name: "Another U" }), "2755")).toBe("Committed elsewhere");
    expect(isExactProgramProspect(prospect(), "2755")).toBe(true);
    expect(isExactProgramProspect(prospect({ school_ids: ["999"] }), "2755")).toBe(false);
  });

  it("loads every page from one immutable class edition", async () => {
    const calls: string[] = [];
    const edition = "a".repeat(64);
    const pages: Record<number, RecruitingClass> = {
      0: { season: 2027, page: 0, page_size: 2, total: 3, edition, captured_at: "2026-09-01", source_receipt: verifiedReceipt(edition), rows: [prospect({ athlete_id: "10" }), prospect({ athlete_id: "11" })] },
      1: { season: 2027, page: 1, page_size: 2, total: 3, edition, captured_at: "2026-09-01", source_receipt: verifiedReceipt(edition), rows: [prospect({ athlete_id: "12" })] },
    };
    const fetcher = async <T,>(url: string): Promise<T> => {
      const page = Number(new URL(`https://example.test${url}`).searchParams.get("page"));
      calls.push(url);
      return pages[page] as T;
    };
    const release = await loadProgramProspectClass(2027, "2755", undefined, fetcher);
    expect(calls).toHaveLength(2);
    expect(release?.rows.map((row) => row.athlete_id)).toEqual(["10", "11", "12"]);
  });

  it("fails closed when a later page changes edition or repeats an athlete", async () => {
    const firstEdition = "a".repeat(64);
    const changedEdition = "b".repeat(64);
    const first: RecruitingClass = { season: 2027, page: 0, page_size: 1, total: 2, edition: firstEdition, captured_at: "2026-09-01", source_receipt: verifiedReceipt(firstEdition, "2026-09-01", 2), rows: [prospect({ athlete_id: "10" })] };
    const changed: RecruitingClass = { season: 2027, page: 1, page_size: 1, total: 2, edition: changedEdition, captured_at: "2026-09-02", source_receipt: verifiedReceipt(changedEdition, "2026-09-02", 2), rows: [prospect({ athlete_id: "11" })] };
    const fetcher = async <T,>(url: string): Promise<T> => (url.includes("page=0") ? first : changed) as T;
    await expect(loadProgramProspectClass(2027, "2755", undefined, fetcher)).resolves.toBeNull();
  });

  it("rejects duplicate exact athlete IDs across pages", async () => {
    const edition = "a".repeat(64);
    const pages: RecruitingClass[] = [
      { season: 2027, page: 0, page_size: 1, total: 2, edition, captured_at: "2026-09-01", source_receipt: verifiedReceipt(edition, "2026-09-01", 2), rows: [prospect({ athlete_id: "10" })] },
      { season: 2027, page: 1, page_size: 1, total: 2, edition, captured_at: "2026-09-01", source_receipt: verifiedReceipt(edition, "2026-09-01", 2), rows: [prospect({ athlete_id: "10" })] },
    ];
    const fetcher = async <T,>(url: string): Promise<T> => pages[Number(new URL(`https://example.test${url}`).searchParams.get("page"))] as T;
    await expect(loadProgramProspectClass(2027, "2755", undefined, fetcher)).resolves.toBeNull();
  });

  it("admits only a verified release receipt that identifies the displayed edition", async () => {
    const edition = "c".repeat(64);
    const release: RecruitingClass = {
      season: 2027,
      page: 0,
      page_size: 50,
      total: 1,
      edition,
      captured_at: "2026-09-01",
      source_receipt: verifiedReceipt(edition, "2026-09-01", 10),
      rows: [prospect({ athlete_id: "10" })],
    };
    expect(validProgramProspectReceipt(release)).toBe(true);
    expect(validProgramProspectReceipt({ ...release, source_receipt: null })).toBe(false);
    expect(validProgramProspectReceipt({ ...release, source_receipt: verifiedReceipt("d".repeat(64), "2026-09-01", 10) })).toBe(false);
    expect(validProgramProspectReceipt({ ...release, source_receipt: { ...verifiedReceipt(edition, "2026-09-01", 10), integrity: "unavailable", sha256: null, sha256_scope: "unavailable" } })).toBe(false);

    const fetcher = async <T,>(): Promise<T> => ({ ...release, source_receipt: null }) as T;
    await expect(loadProgramProspectClass(2027, "2755", undefined, fetcher)).resolves.toBeNull();
  });

  it("keeps class identity and sorts recorded ranks without inventing missing values", () => {
    const rows = combineProgramProspectClasses([
      { season: 2027, total: 2, cohort: { committed: 0 }, edition: "b", captured_at: "2026-09-01", rows: [
        prospect({ athlete_id: "2", name: "Unranked", rank: null }),
        prospect({ athlete_id: "1", name: "Ranked", rank: 40 }),
        prospect({ athlete_id: "4", name: "Wrong program", rank: 1, school_ids: ["999"] }),
      ] },
      { season: 2026, total: 1, cohort: { committed: 1 }, edition: "a", captured_at: "2026-08-01", rows: [
        prospect({ athlete_id: "3", name: "Committed", rank: 80, committed_team_id: "2755" }),
      ] },
    ], "2755");

    expect(rows.map((row) => `${row.season}:${row.name}:${row.rank ?? "missing"}`)).toEqual([
      "2026:Committed:80",
      "2027:Ranked:40",
      "2027:Unranked:missing",
    ]);
    expect(rows[0].evidence).toBe("Recorded commitment");
  });

  it("summarizes only exact program matches instead of national class totals", () => {
    const rows = [
      { ...prospect({ athlete_id: "10", committed_team_id: "2755" }), season: 2026, evidence: "Recorded commitment" as const },
      { ...prospect({ athlete_id: "11", committed_team_id: null }), season: 2027, evidence: "Listed school" as const },
      { ...prospect({ athlete_id: "12", committed_team_id: "2755" }), season: 2027, evidence: "Recorded commitment" as const },
      { ...prospect({ athlete_id: "13", committed_team_id: "999", committed_team_name: "Another U" }), season: 2027, evidence: "Committed elsewhere" as const },
    ];
    expect(summarizeProgramProspects(rows)).toEqual({
      matched: 4,
      committed: 2,
      listed: 1,
      committedElsewhere: 1,
      editions: 2,
      byClass: [
        { season: 2026, matched: 1, committed: 1, listed: 0, committedElsewhere: 0, committedRanked: 1, committedBestRank: 20, committedAverageRank: 20, listedRanked: 0, listedBestRank: null, listedAverageRank: null },
        { season: 2027, matched: 3, committed: 1, listed: 1, committedElsewhere: 1, committedRanked: 1, committedBestRank: 20, committedAverageRank: 20, listedRanked: 1, listedBestRank: 20, listedAverageRank: 20 },
      ],
    });
  });

  it("profiles commitment and open ranks separately without treating missing ranks as zero", () => {
    const rows = [
      { ...prospect({ athlete_id: "10", rank: 36 }), season: 2027, evidence: "Recorded commitment" as const },
      { ...prospect({ athlete_id: "11", rank: 100 }), season: 2027, evidence: "Recorded commitment" as const },
      { ...prospect({ athlete_id: "12", rank: null }), season: 2027, evidence: "Recorded commitment" as const },
      { ...prospect({ athlete_id: "13", rank: 7 }), season: 2027, evidence: "Listed school" as const },
      { ...prospect({ athlete_id: "14", rank: 0 }), season: 2027, evidence: "Listed school" as const },
      { ...prospect({ athlete_id: "15", rank: 1 }), season: 2027, evidence: "Committed elsewhere" as const },
    ];
    const profile = summarizeProgramProspects(rows).byClass[0];

    expect(profile).toMatchObject({
      committed: 3,
      committedRanked: 2,
      committedBestRank: 36,
      committedAverageRank: 68,
      listed: 2,
      listedRanked: 1,
      listedBestRank: 7,
      listedAverageRank: 7,
      committedElsewhere: 1,
    });
  });

  it("places exact-program commitments beside receipted roster role workload", () => {
    const rows = combineProgramProspectClasses([{ season: 2027, total: 3, edition: "recruiting-a", captured_at: "2026-09-19", rows: [
      prospect({ athlete_id: "10", position: "PG", rank: 20, committed_team_id: "2755" }),
      prospect({ athlete_id: "11", position: "SG", rank: null, committed_team_id: "2755" }),
      prospect({ athlete_id: "12", position: "C", rank: 80, committed_team_id: "999", school_ids: ["2755"] }),
    ] }], "2755");
    const readiness = {
      teamId: "2755",
      listed: 5,
      positionCounts: { guard: 2, forward: 1, center: 1, unreported: 1 },
      positionWorkload: {
        guard: { priorMinutes: 1000, returningMinutes: 400, incomingPriorMinutes: 200, returningShare: 0.4 },
        forward: { priorMinutes: 500, returningMinutes: 500, incomingPriorMinutes: 0, returningShare: 1 },
        center: { priorMinutes: 300, returningMinutes: 0, incomingPriorMinutes: 0, returningShare: 0 },
        unreported: { priorMinutes: 0, returningMinutes: 0, incomingPriorMinutes: 0, returningShare: null },
      },
    } as RosterLabRow;
    const context = buildProgramRoleContext(rows, "2755", readiness, 2027, { dataset: "rosters", url: null, fetched_at: "2026-09-19T00:00:00Z", sha256: "a".repeat(64) });

    expect(context?.classes).toEqual([2027]);
    expect(context?.roles.find((role) => role.role === "guard")).toEqual(expect.objectContaining({
      listed: 2,
      priorMinutes: 1000,
      returningMinutes: 400,
      commitments: { 2027: { total: 2, ranked: 1, bestRank: 20 } },
    }));
    expect(context?.roles.find((role) => role.role === "center")?.commitments[2027].total).toBe(0);
  });

  it("withholds program role context on a mismatched program, malformed workload or missing receipt", () => {
    const rows = [{ ...prospect({ athlete_id: "10", committed_team_id: "2755" }), season: 2027, evidence: "Recorded commitment" as const }];
    const readiness = {
      teamId: "2755",
      listed: 1,
      positionCounts: { guard: 1, forward: 0, center: 0, unreported: 0 },
      positionWorkload: {
        guard: { priorMinutes: 100, returningMinutes: 80, incomingPriorMinutes: 0, returningShare: 0.8 },
        forward: { priorMinutes: 0, returningMinutes: 0, incomingPriorMinutes: 0, returningShare: null },
        center: { priorMinutes: 0, returningMinutes: 0, incomingPriorMinutes: 0, returningShare: null },
        unreported: { priorMinutes: 0, returningMinutes: 0, incomingPriorMinutes: 0, returningShare: null },
      },
    } as RosterLabRow;
    const receipt = { dataset: "rosters", url: null, fetched_at: null, sha256: "a".repeat(64) };

    expect(buildProgramRoleContext(rows, "999", readiness, 2027, receipt)).toBeNull();
    expect(buildProgramRoleContext(rows, "2755", { ...readiness, positionWorkload: { ...readiness.positionWorkload, guard: { ...readiness.positionWorkload.guard, returningMinutes: 120 } } }, 2027, receipt)).toBeNull();
    expect(buildProgramRoleContext(rows, "2755", readiness, 2027, { ...receipt, sha256: null })).toBeNull();
  });
});
