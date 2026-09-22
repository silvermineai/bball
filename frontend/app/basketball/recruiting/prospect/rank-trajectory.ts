import type { RecruitingHistoryEntry } from "./commitment-history";

export type ProspectRankDimensionKey = "position_rank" | "state_rank" | "region_rank";

export type ProspectRankDimensionTrajectory = {
  key: ProspectRankDimensionKey;
  label: string;
  rankedCaptures: number;
  totalCaptures: number;
  rankCoverage: number;
  latestCaptureRanked: boolean;
  firstRank: number;
  latestRank: number;
  bestRank: number;
  worstRank: number;
  netChange: number;
  direction: "improved" | "declined" | "unchanged";
};

const DIMENSIONS: Array<{ key: ProspectRankDimensionKey; label: string }> = [
  { key: "position_rank", label: "Position" },
  { key: "state_rank", label: "State" },
  { key: "region_rank", label: "Region" },
];

const validRank = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export type ProspectRankTrajectory = {
  totalCaptures: number;
  rankedCaptures: number;
  rankCoverage: number;
  /** Whether the newest retained capture itself has a usable positive rank. */
  latestCaptureRanked: boolean;
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
    .filter(validRank);
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
    latestCaptureRanked: history.at(-1)?.rank != null
      && Number.isSafeInteger(history.at(-1)?.rank)
      && history.at(-1)!.rank! > 0,
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

/**
 * Summarize a dimensional rank without treating a missing source value as a
 * demotion. These are source-published position, state, and region ranks;
 * they remain separate from the national rank and from any Silvermine score.
 */
export function prospectDimensionRankTrajectory(
  history: ReadonlyArray<RecruitingHistoryEntry>,
  key: ProspectRankDimensionKey,
): ProspectRankDimensionTrajectory | null {
  const ranked = history
    .map((entry) => entry[key])
    .filter(validRank);
  if (!ranked.length) return null;

  const firstRank = ranked[0];
  const latestRank = ranked[ranked.length - 1];
  const bestRank = Math.min(...ranked);
  const worstRank = Math.max(...ranked);
  const netChange = firstRank - latestRank;
  return {
    key,
    label: DIMENSIONS.find((dimension) => dimension.key === key)?.label || key,
    rankedCaptures: ranked.length,
    totalCaptures: history.length,
    rankCoverage: history.length ? ranked.length / history.length : 0,
    latestCaptureRanked: validRank(history.at(-1)?.[key]),
    firstRank,
    latestRank,
    bestRank,
    worstRank,
    netChange,
    direction: netChange > 0 ? "improved" : netChange < 0 ? "declined" : "unchanged",
  };
}

/** Return only dimensional boards with at least one valid source rank. */
export function prospectDimensionRankTrajectories(
  history: ReadonlyArray<RecruitingHistoryEntry>,
): ProspectRankDimensionTrajectory[] {
  return DIMENSIONS
    .map(({ key }) => prospectDimensionRankTrajectory(history, key))
    .filter((trajectory): trajectory is ProspectRankDimensionTrajectory => trajectory != null);
}
