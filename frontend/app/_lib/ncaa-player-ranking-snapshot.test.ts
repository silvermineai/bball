import { describe, expect, it } from "vitest";
import { rankingSnapshotSearch, snapshotRow, summarizeRankingSnapshot, type SnapshotRow } from "./ncaa-player-ranking-snapshot";

const definition = { metric: "ppg" as const, label: "Points per game", note: "5 games" };

describe("NCAA player ranking snapshot", () => {
  it("matches the exact source ID and computes a cohort percentile", () => {
    const row = snapshotRow(definition, {
      total: 101,
      rows: [
        { player_id: "42", value: 19.2, rank: 11 },
        { player_id: "420", value: 99, rank: 1 },
      ],
    }, "42");
    expect(row.status).toBe("qualified");
    expect(row.rank).toBe(11);
    expect(row.percentile).toBe(90);
  });

  it("keeps a player outside the qualified board explicit", () => {
    const row = snapshotRow(definition, { total: 8, rows: [] }, "42");
    expect(row.status).toBe("not_qualified");
    expect(row.value).toBeNull();
    expect(row.percentile).toBeNull();
    expect(row.total).toBe(8);
  });

  it("summarizes only qualified boards without mixing raw metric units", () => {
    const rows: SnapshotRow[] = [
      { metric: "ppg", label: "Points", value: 20, rank: 6, total: 101, percentile: 95, status: "qualified", note: "sample" },
      { metric: "ts", label: "True shooting", value: 64, rank: 11, total: 101, percentile: 90, status: "qualified", note: "sample" },
      { metric: "mpg", label: "Minutes", value: 30, rank: 51, total: 101, percentile: 50, status: "qualified", note: "sample" },
      { metric: "impact_index", label: "Impact", value: null, rank: null, total: 80, percentile: null, status: "not_qualified", note: "sample" },
    ];
    expect(summarizeRankingSnapshot(rows)).toEqual({
      qualified: 3,
      total: 4,
      topDecile: 2,
      medianPercentile: 90,
      strongest: rows[0],
    });
  });

  it("keeps an all-unavailable profile explicit", () => {
    const rows: SnapshotRow[] = [
      { metric: "ppg", label: "Points", value: null, rank: null, total: 0, percentile: null, status: "unavailable", note: "sample" },
    ];
    expect(summarizeRankingSnapshot(rows)).toEqual({
      qualified: 0,
      total: 1,
      topDecile: 0,
      medianPercentile: null,
      strongest: null,
    });
  });

  it("links back to the exact snapshot qualification settings", () => {
    expect(new URLSearchParams(rankingSnapshotSearch("ts", 2026, "42"))).toEqual(new URLSearchParams({
      season: "2026",
      metric: "ts",
      minGames: "5",
      minMinutes: "200",
      minVolume: "100",
      q: "42",
    }));
    expect(new URLSearchParams(rankingSnapshotSearch("ppg", 2026, "42")).get("minVolume")).toBe("0");
  });
});
