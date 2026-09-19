import { describe, expect, it } from "vitest";
import {
  combineProgramProspectClasses,
  isExactProgramProspect,
  loadProgramProspectClass,
  programProspectEvidence,
  PROGRAM_PROSPECT_CLASSES,
  summarizeProgramProspects,
  type ProgramProspect,
  type RecruitingClass,
} from "./ProgramProspects";

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

describe("program prospect evidence", () => {
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
    const pages: Record<number, RecruitingClass> = {
      0: { season: 2027, page: 0, page_size: 2, total: 3, edition: "release-a", captured_at: "2026-09-01", rows: [prospect({ athlete_id: "10" }), prospect({ athlete_id: "11" })] },
      1: { season: 2027, page: 1, page_size: 2, total: 3, edition: "release-a", captured_at: "2026-09-01", rows: [prospect({ athlete_id: "12" })] },
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
    const first: RecruitingClass = { season: 2027, page: 0, page_size: 1, total: 2, edition: "release-a", captured_at: "2026-09-01", rows: [prospect({ athlete_id: "10" })] };
    const changed: RecruitingClass = { season: 2027, page: 1, page_size: 1, total: 2, edition: "release-b", captured_at: "2026-09-02", rows: [prospect({ athlete_id: "11" })] };
    const fetcher = async <T,>(url: string): Promise<T> => (url.includes("page=0") ? first : changed) as T;
    await expect(loadProgramProspectClass(2027, "2755", undefined, fetcher)).resolves.toBeNull();
  });

  it("rejects duplicate exact athlete IDs across pages", async () => {
    const pages: RecruitingClass[] = [
      { season: 2027, page: 0, page_size: 1, total: 2, edition: "release-a", captured_at: "2026-09-01", rows: [prospect({ athlete_id: "10" })] },
      { season: 2027, page: 1, page_size: 1, total: 2, edition: "release-a", captured_at: "2026-09-01", rows: [prospect({ athlete_id: "10" })] },
    ];
    const fetcher = async <T,>(url: string): Promise<T> => pages[Number(new URL(`https://example.test${url}`).searchParams.get("page"))] as T;
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
});
