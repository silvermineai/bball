import { describe, expect, it } from "vitest";
import { summarizeMatchupRecruiting } from "./MatchupRecruitingContext";
import type { ProgramProspectRow } from "../../programs/[id]/ProgramProspects";

const row = (overrides: Partial<ProgramProspectRow> = {}): ProgramProspectRow => ({
  athlete_id: "1",
  name: "Example prospect",
  position: "PG",
  rank: 50,
  grade: 90,
  status: "committed",
  committed_team_id: "100",
  committed_team_name: "Example",
  school_ids: ["100"],
  high_school: null,
  hometown: null,
  season: 2027,
  evidence: "Recorded commitment",
  ...overrides,
});

describe("summarizeMatchupRecruiting", () => {
  it("keeps classes separate and does not treat listed rows as commitments", () => {
    const summaries = summarizeMatchupRecruiting([
      row({ athlete_id: "a", name: "Ranked commit", rank: 12, season: 2027, evidence: "Recorded commitment" }),
      row({ athlete_id: "b", name: "Listed target", rank: 7, season: 2027, evidence: "Listed school", committed_team_id: null, committed_team_name: null }),
      row({ athlete_id: "c", name: "Unranked commit", rank: null, season: 2026, evidence: "Recorded commitment" }),
    ]);
    expect(summaries).toEqual([
      expect.objectContaining({ season: 2026, matched: 1, committed: 1, listed: 0, ranked: 0, bestRank: null, topProspects: [] }),
      expect.objectContaining({ season: 2027, matched: 2, committed: 1, listed: 1, ranked: 2, bestRank: 7, topProspects: [
        expect.objectContaining({ athleteId: "b", evidence: "Listed school", rank: 7 }),
        expect.objectContaining({ athleteId: "a", evidence: "Recorded commitment", rank: 12 }),
      ] }),
    ]);
  });

  it("limits the displayed ranked records while preserving the counts", () => {
    const rows = Array.from({ length: 5 }, (_, index) => row({ athlete_id: String(index), rank: index + 1, season: 2027 }));
    const summary = summarizeMatchupRecruiting(rows, [2027])[0];
    expect(summary.matched).toBe(5);
    expect(summary.ranked).toBe(5);
    expect(summary.topProspects.map((prospect) => prospect.rank)).toEqual([1, 2, 3]);
  });
});
