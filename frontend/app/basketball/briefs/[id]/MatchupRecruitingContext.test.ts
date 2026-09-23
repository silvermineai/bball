import { describe, expect, it } from "vitest";
import { summarizeMatchupRecruiting } from "./MatchupRecruitingContext";
import type { ProgramProspectRow } from "../../programs/[id]/ProgramProspects";
import type { RecruitingPerson } from "../../../_lib/recruiting";
import { exactMatchupProduction } from "./MatchupRecruitingContext";

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

  it("attaches prior production only for the exact reviewed class and source ID", () => {
    const production: RecruitingPerson[] = [{
      key: "exact",
      name: "Exact prospect",
      team_id: "100",
      category: "transfer",
      previous_program: "Prior",
      stats: {
        id: "1001",
        team_id: "200",
        team: "Prior",
        season: 2026,
        games: 25,
        mpg: 28,
        ppg: 14,
        rpg: 5,
        apg: 3,
        spg: 1,
        bpg: 0.2,
        topg: 2,
        efg: 0.55,
        ts: 0.58,
        three_pct: null,
        ft_pct: 0.75,
        ft_rate: 0.2,
        three_rate: 0.4,
        tov_rate: 0.12,
        incomplete_box_games: 0,
        identity_basis: "exact ID",
      },
    }];
    const rows = [
      row({ athlete_id: "1001", season: 2027, rank: 3 }),
      row({ athlete_id: "1001", season: 2026, rank: 4 }),
    ];
    const summaries = summarizeMatchupRecruiting(rows, [2026, 2027], production, 2027);
    expect(summaries[0].topProspects[0].production).toBeNull();
    expect(summaries[1].topProspects[0].production?.ppg).toBe(14);
    expect(exactMatchupProduction([...production, production[0]], "1001")).toBeNull();
    expect(exactMatchupProduction(production, "not-an-id")).toBeNull();
  });
});
