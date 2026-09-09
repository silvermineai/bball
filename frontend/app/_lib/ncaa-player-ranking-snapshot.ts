export type SnapshotMetric = "ppg" | "ts" | "balanced_index" | "impact_index";

export type SnapshotRow = {
  metric: SnapshotMetric;
  label: string;
  value: number | null;
  rank: number | null;
  total: number;
  percentile: number | null;
  status: "qualified" | "not_qualified" | "unavailable";
  note: string;
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
  { metric: "ts", label: "True shooting", minVolume: 100, note: "5 games · 200 minutes · 100 FGA units" },
  { metric: "balanced_index", label: "Balanced production", note: "5 games · 200 minutes · 4 of 8 components" },
  { metric: "impact_index", label: "Impact + production", note: "5 games · 200 minutes · 500 O/D possessions" },
];

const percentile = (rank: number, total: number) =>
  total <= 1 ? 100 : Math.max(0, Math.min(100, (100 * (total - rank)) / (total - 1)));

export const snapshotRow = (
  definition: (typeof definitions)[number],
  result: ApiResult | null,
  playerId: string,
): SnapshotRow => {
  const total = Number.isFinite(Number(result?.total)) ? Number(result?.total) : 0;
  const row = result?.rows?.find((candidate) => String(candidate.player_id || "") === playerId);
  const rank = Number.isInteger(Number(row?.rank)) && Number(row?.rank) > 0 ? Number(row?.rank) : null;
  const value = typeof row?.value === "number" && Number.isFinite(row.value) ? row.value : null;
  const status = rank != null && value != null ? "qualified" : total > 0 ? "not_qualified" : "unavailable";
  return {
    metric: definition.metric,
    label: definition.label,
    value,
    rank,
    total,
    percentile: rank == null ? null : percentile(rank, total),
    status,
    note: definition.note,
  };
};

export async function loadNcaaPlayerRankingSnapshot(
  playerId: string,
  season: number,
  signal?: AbortSignal,
): Promise<SnapshotRow[]> {
  const results = await Promise.all(
    definitions.map(async (definition) => {
      const params = new URLSearchParams({
        season: String(season),
        metric: definition.metric,
        minGames: "5",
        minMinutes: "200",
        q: playerId,
      });
      if (definition.minVolume != null) params.set("minVolume", String(definition.minVolume));
      try {
        const response = await fetch(`/api/basketball/research/ncaa-player-rankings?${params}`, { signal });
        if (!response.ok) return snapshotRow(definition, null, playerId);
        return snapshotRow(definition, (await response.json()) as ApiResult, playerId);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return snapshotRow(definition, null, playerId);
      }
    }),
  );
  return results;
}
