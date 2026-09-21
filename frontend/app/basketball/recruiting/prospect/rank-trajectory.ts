import type { RecruitingHistoryEntry } from "./commitment-history";

export type ProspectRankTrajectory = {
  totalCaptures: number;
  rankedCaptures: number;
  rankCoverage: number;
  firstRank: number;
  latestRank: number;
  bestRank: number;
  worstRank: number;
  averageRank: number;
  rankSpan: number;
  netChange: number;
  direction: "improved" | "declined" | "unchanged";
};

/**
 * Summarize only the positive national ranks in one validated, chronological
 * prospect history. Missing ranks are excluded from rank statistics rather
 * than treated as zero or as a demotion.
 */
export function prospectRankTrajectory(
  history: RecruitingHistoryEntry[],
): ProspectRankTrajectory | null {
  const ranked = history
    .map((entry) => entry.rank)
    .filter((value): value is number => value !== null && Number.isSafeInteger(value) && value > 0);
  if (!ranked.length) return null;

  const firstRank = ranked[0];
  const latestRank = ranked[ranked.length - 1];
  const bestRank = Math.min(...ranked);
  const worstRank = Math.max(...ranked);
  const netChange = firstRank - latestRank;

  return {
    totalCaptures: history.length,
    rankedCaptures: ranked.length,
    rankCoverage: ranked.length / history.length,
    firstRank,
    latestRank,
    bestRank,
    worstRank,
    averageRank: ranked.reduce((sum, value) => sum + value, 0) / ranked.length,
    rankSpan: worstRank - bestRank,
    netChange,
    direction: netChange > 0 ? "improved" : netChange < 0 ? "declined" : "unchanged",
  };
}
