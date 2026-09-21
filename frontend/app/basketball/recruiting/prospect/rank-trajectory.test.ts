import { describe, expect, it } from "vitest";
import { prospectRankTrajectory } from "./rank-trajectory";
import type { RecruitingHistoryEntry } from "./commitment-history";

const capture = (rank: number | null, index: number): RecruitingHistoryEntry => ({
  edition: `edition-${index}`,
  captured_at: `2026-09-${String(index + 10).padStart(2, "0")}T00:00:00Z`,
  rank,
  grade: null,
  status: null,
  committed_team_id: null,
  committed_team_name: null,
  source_url: "",
});

describe("prospectRankTrajectory", () => {
  it("summarizes ranked captures while preserving gaps", () => {
    expect(prospectRankTrajectory([
      capture(80, 0),
      capture(50, 1),
      capture(null, 2),
      capture(60, 3),
    ])).toEqual({
      totalCaptures: 4,
      rankedCaptures: 3,
      rankCoverage: 0.75,
      firstRank: 80,
      latestRank: 60,
      bestRank: 50,
      worstRank: 80,
      averageRank: 190 / 3,
      rankSpan: 30,
      netChange: 20,
      direction: "improved",
    });
  });

  it("labels decline and unchanged endpoints", () => {
    expect(prospectRankTrajectory([capture(10, 0), capture(24, 1)])?.direction).toBe("declined");
    expect(prospectRankTrajectory([capture(10, 0), capture(10, 1)])?.direction).toBe("unchanged");
  });

  it("withholds a trajectory when no positive rank is recorded", () => {
    expect(prospectRankTrajectory([capture(null, 0), capture(null, 1)])).toBeNull();
    expect(prospectRankTrajectory([capture(0, 0), capture(-2, 1)])).toBeNull();
  });
});
