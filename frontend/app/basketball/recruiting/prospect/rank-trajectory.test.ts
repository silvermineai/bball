import { describe, expect, it } from "vitest";
import { prospectDimensionRankTrajectories, prospectDimensionRankTrajectory, prospectRankTrajectory } from "./rank-trajectory";
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

const dimensionalCapture = (index: number, patch: Partial<RecruitingHistoryEntry> = {}): RecruitingHistoryEntry => ({
  ...capture(null, index),
  ...patch,
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
      latestCaptureRanked: true,
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

  it("marks when the newest retained capture is unranked", () => {
    expect(prospectRankTrajectory([capture(10, 0), capture(null, 1)])).toMatchObject({
      latestCaptureRanked: false,
      firstRank: 10,
      latestRank: 10,
      rankedCaptures: 1,
      totalCaptures: 2,
    });
  });

  it("withholds a trajectory when no positive rank is recorded", () => {
    expect(prospectRankTrajectory([capture(null, 0), capture(null, 1)])).toBeNull();
    expect(prospectRankTrajectory([capture(0, 0), capture(-2, 1)])).toBeNull();
  });

  it("summarizes dimensional ranks independently and preserves missing captures", () => {
    expect(prospectDimensionRankTrajectory([
      dimensionalCapture(0, { position_rank: 12, state_rank: 7 }),
      dimensionalCapture(1, { position_rank: null, state_rank: 4 }),
      dimensionalCapture(2, { position_rank: 8, state_rank: null }),
    ], "position_rank")).toMatchObject({
      key: "position_rank",
      label: "Position",
      rankedCaptures: 2,
      totalCaptures: 3,
      rankCoverage: 2 / 3,
      latestCaptureRanked: true,
      firstRank: 12,
      latestRank: 8,
      bestRank: 8,
      worstRank: 12,
      netChange: 4,
      direction: "improved",
    });
    expect(prospectDimensionRankTrajectory([
      dimensionalCapture(0, { state_rank: 7 }),
      dimensionalCapture(1, { state_rank: 4 }),
    ], "state_rank")?.direction).toBe("improved");
  });

  it("returns available dimensional boards in stable position, state, region order", () => {
    const trajectories = prospectDimensionRankTrajectories([
      dimensionalCapture(0, { region_rank: 20, state_rank: 9 }),
      dimensionalCapture(1, { region_rank: 18, state_rank: null }),
    ]);
    expect(trajectories.map((trajectory) => trajectory.key)).toEqual(["state_rank", "region_rank"]);
    expect(prospectDimensionRankTrajectories([capture(null, 0)])).toEqual([]);
  });
});
