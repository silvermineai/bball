export type SnapshotMetric = "ppg" | "fpg" | "mpg" | "topg" | "ts" | "balanced_index" | "impact_index";

export type SnapshotRow = {
  metric: SnapshotMetric;
  label: string;
  value: number | null;
  rank: number | null;
  total: number;
  percentile: number | null;
  status: "qualified" | "not_qualified" | "unavailable";
  note: string;
  /** Same exact archive ID and board cutoff in the prior season, when queried. */
  trend?: SnapshotTrend;
};

export type SnapshotTrend = {
  previousSeason: number;
  previousValue: number | null;
  previousRank: number | null;
  previousTotal: number;
  previousPercentile: number | null;
  previousStatus: SnapshotRow["status"];
  /** Positive means the player's rank number improved (for example 18 → 11). */
  rankDelta: number | null;
};

export type SnapshotSummary = {
  qualified: number;
  total: number;
  topDecile: number;
  medianPercentile: number | null;
  strongest: SnapshotRow | null;
};

type ApiRow = {
  player_id?: unknown;
  value?: unknown;
  rank?: unknown;
};

type ApiResult = {
  total?: unknown;
  rows?: ApiRow[];
};

const definitions: Array<{
  metric: SnapshotMetric;
  label: string;
  minVolume?: number;
  note: string;
}> = [
  { metric: "ppg", label: "Points per game", note: "5 games · 200 minutes" },
  { metric: "fpg", label: "Fouls per game", note: "5 games · 200 minutes" },
  { metric: "mpg", label: "Minutes per game", note: "5 games · 200 minutes" },
  { metric: "topg", label: "Turnovers per game", note: "5 games · 200 minutes" },
  { metric: "ts", label: "True shooting", minVolume: 100, note: "5 games · 200 minutes · 100 FGA units" },
  { metric: "balanced_index", label: "Balanced production", note: "5 games · 200 minutes · 4 of 9 components" },
  { metric: "impact_index", label: "Impact + production", note: "5 games · 200 minutes · 500 O/D possessions" },
];

export function rankingSnapshotSearch(metric: SnapshotMetric, season: number, playerId: string) {
  const definition = definitions.find((candidate) => candidate.metric === metric);
  const params = new URLSearchParams({
    season: String(season),
    metric,
    minGames: "5",
    minMinutes: "200",
    minVolume: String(definition?.minVolume ?? 0),
    playerIds: playerId,
  });
  return params.toString();
}

const percentile = (rank: number, total: number) =>
  total <= 1 ? 100 : Math.max(0, Math.min(100, (100 * (total - rank)) / (total - 1)));

/**
 * Summarize only boards the player qualified for. This deliberately uses the
 * API rank/percentile rather than mixing raw values with different units.
 */
export function summarizeRankingSnapshot(rows: SnapshotRow[]): SnapshotSummary {
  const qualified = rows.filter(
    (row): row is SnapshotRow & { percentile: number } =>
      row.status === "qualified" && row.percentile != null,
  );
  const ordered = qualified.map((row) => row.percentile).sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  const medianPercentile = !ordered.length
    ? null
    : ordered.length % 2
      ? ordered[middle]
      : (ordered[middle - 1] + ordered[middle]) / 2;
  const strongest = qualified.reduce<SnapshotRow | null>(
    (best, row) => best == null || row.percentile > (best.percentile ?? -1) ? row : best,
    null,
  );
  return {
    qualified: qualified.length,
    total: rows.length,
    topDecile: qualified.filter((row) => row.percentile >= 90).length,
    medianPercentile,
    strongest,
  };
}

export const snapshotRow = (
  definition: (typeof definitions)[number],
  result: ApiResult | null,
  playerId: string,
): SnapshotRow => {
  const rawTotal = Number(result?.total);
  const validTotal = Number.isInteger(rawTotal) && rawTotal > 0;
  const total = validTotal ? rawTotal : 0;
  const row = result?.rows?.find((candidate) => String(candidate.player_id || "") === playerId);
  const candidateRank = Number.isInteger(Number(row?.rank)) && Number(row?.rank) > 0 ? Number(row?.rank) : null;
  const rankInCohort = validTotal && candidateRank != null && candidateRank <= total;
  const rank = rankInCohort ? candidateRank : null;
  const value = rankInCohort && typeof row?.value === "number" && Number.isFinite(row.value) ? row.value : null;
  const malformedPosition = candidateRank != null && !rankInCohort;
  const status = malformedPosition || !validTotal
    ? "unavailable"
    : rank != null && value != null
      ? "qualified"
      : "not_qualified";
  const note = !validTotal
    ? "Board denominator unavailable"
    : malformedPosition
      ? "Board rank is outside its qualified cohort"
      : definition.note;
  return {
    metric: definition.metric,
    label: definition.label,
    value,
    rank,
    total,
    percentile: rank == null ? null : percentile(rank, total),
    status,
    note,
  };
};

/**
 * Compare only qualified exact-ID rows. A missing rank stays unavailable: a
 * player entering or leaving a qualified cohort is not assigned a fabricated
 * movement number.
 */
export function rankingRankDelta(currentRank: number | null, previousRank: number | null) {
  return currentRank != null && previousRank != null ? previousRank - currentRank : null;
}

export async function loadNcaaPlayerRankingSnapshot(
  playerId: string,
  season: number,
  signal?: AbortSignal,
): Promise<SnapshotRow[]> {
  const results = await Promise.all(
    definitions.map(async (definition) => {
      const loadBoard = async (boardSeason: number) => {
        const params = new URLSearchParams({
          season: String(boardSeason),
          metric: definition.metric,
          minGames: "5",
          minMinutes: "200",
          playerIds: playerId,
        });
        if (definition.minVolume != null) params.set("minVolume", String(definition.minVolume));
        try {
          const response = await fetch(`/api/basketball/research/ncaa-player-rankings?${params}`, { signal });
          if (!response.ok) return null;
          return await response.json() as ApiResult;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          return null;
        }
      };
      const currentResult = await loadBoard(season);
      const current = snapshotRow(definition, currentResult, playerId);
      // The API's published ranking catalog starts at 2010. Keep the selected
      // board useful at that boundary without requesting an invalid prior year.
      if (season <= 2010) return current;
      const previousResult = await loadBoard(season - 1);
      const previous = snapshotRow(definition, previousResult, playerId);
      return {
        ...current,
        trend: {
          previousSeason: season - 1,
          previousValue: previous.value,
          previousRank: previous.rank,
          previousTotal: previous.total,
          previousPercentile: previous.percentile,
          previousStatus: previous.status,
          rankDelta: rankingRankDelta(current.rank, previous.rank),
        },
      };
    }),
  );
  return results;
}
