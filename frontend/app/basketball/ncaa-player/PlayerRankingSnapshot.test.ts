import { describe, expect, it } from "vitest";
import { rankingTrendLabel } from "./PlayerRankingSnapshot";
import type { SnapshotRow } from "../../_lib/ncaa-player-ranking-snapshot";

const row = (trend: SnapshotRow["trend"]): SnapshotRow => ({
  metric: "ppg",
  label: "Points per game",
  value: 18,
  rank: 11,
  total: 100,
  percentile: 89.9,
  status: "qualified",
  note: "sample",
  trend,
});

describe("player ranking movement", () => {
  it("describes improvement, decline and unchanged ranks", () => {
    expect(rankingTrendLabel(row({ previousSeason: 2025, previousValue: 16, previousRank: 18, previousTotal: 100, previousPercentile: 82, previousStatus: "qualified", rankDelta: 7 }))).toContain("↑ 7 ranks from #18");
    expect(rankingTrendLabel(row({ previousSeason: 2025, previousValue: 16, previousRank: 4, previousTotal: 100, previousPercentile: 97, previousStatus: "qualified", rankDelta: -7 }))).toContain("↓ 7 ranks from #4");
    expect(rankingTrendLabel(row({ previousSeason: 2025, previousValue: 16, previousRank: 11, previousTotal: 100, previousPercentile: 89.9, previousStatus: "qualified", rankDelta: 0 }))).toContain("unchanged at #11");
  });

  it("keeps entry and missing prior boards explicit", () => {
    expect(rankingTrendLabel(row({ previousSeason: 2025, previousValue: null, previousRank: null, previousTotal: 100, previousPercentile: null, previousStatus: "not_qualified", rankDelta: null }))).toContain("sample not met");
    expect(rankingTrendLabel(row({ previousSeason: 2025, previousValue: null, previousRank: null, previousTotal: 0, previousPercentile: null, previousStatus: "unavailable", rankDelta: null }))).toContain("no board evidence");
    expect(rankingTrendLabel(row(undefined))).toBe("Prior season not queried");
  });
});
