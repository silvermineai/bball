import type { BBPlayer } from "./basketball-types";

export type SimilarPlayer = BBPlayer & {
  similarity: number;
  matchedMetrics: number;
};

type SimilarMetric = {
  key: keyof BBPlayer;
  weight: number;
};

const metrics: SimilarMetric[] = [
  { key: "ppg", weight: 1.2 },
  { key: "rpg", weight: 1 },
  { key: "apg", weight: 1 },
  { key: "spg", weight: 0.8 },
  { key: "bpg", weight: 0.8 },
  { key: "topg", weight: 0.8 },
  { key: "mpg", weight: 1 },
  { key: "ts", weight: 1.1 },
  { key: "efg", weight: 1 },
  { key: "three_rate", weight: 0.7 },
  { key: "ft_rate", weight: 0.7 },
];

function numeric(player: BBPlayer, key: keyof BBPlayer): number | null {
  const value = player[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percentile(values: number[], target: number): number {
  if (values.length < 2) return 0.5;
  let below = 0;
  for (const value of values) if (value < target) below += 1;
  return below / (values.length - 1);
}

/**
 * Rank source-season player profiles by distance across observed rate and
 * workload percentiles. This is a descriptive archive lookup: it never joins
 * identities across seasons or implies a future role.
 */
export function findSimilarPlayers(
  target: BBPlayer,
  players: BBPlayer[],
  limit = 5,
): SimilarPlayer[] {
  // Keep the selected profile under the same full-sample gate as its peers.
  // A sparse target can still contain four numeric fields by chance, but its
  // percentile position is not comparable to the qualified season cohort.
  if (!target.qualified) return [];
  const cohort = players.filter(
    (player) => player.season === target.season
      && player.id !== target.id
      // Match the player index's full-sample gate so one-game or partial
      // profiles do not become misleading nearest neighbors.
      && player.qualified,
  );
  const distributions = new Map<keyof BBPlayer, number[]>();
  for (const metric of metrics) {
    const values = cohort
      .map((player) => numeric(player, metric.key))
      .filter((value): value is number => value != null);
    if (values.length > 1) distributions.set(metric.key, values);
  }
  const ranked = cohort
    .map((player) => {
      let squared = 0;
      let weight = 0;
      let matchedMetrics = 0;
      for (const metric of metrics) {
        const distribution = distributions.get(metric.key);
        const targetValue = numeric(target, metric.key);
        const playerValue = numeric(player, metric.key);
        if (!distribution || targetValue == null || playerValue == null) continue;
        const targetRank = percentile(distribution, targetValue);
        const playerRank = percentile(distribution, playerValue);
        squared += ((targetRank - playerRank) ** 2) * metric.weight;
        weight += metric.weight;
        matchedMetrics += 1;
      }
      if (matchedMetrics < 4 || weight === 0) return null;
      const distance = Math.sqrt(squared / weight);
      return {
        ...player,
        similarity: Math.max(0, Math.round((1 - distance) * 1000) / 10),
        matchedMetrics,
      } satisfies SimilarPlayer;
    })
    .filter((player): player is SimilarPlayer => player != null)
    .sort(
      (a, b) => b.similarity - a.similarity
        || b.matchedMetrics - a.matchedMetrics
        || a.name.localeCompare(b.name),
    );
  return ranked.slice(0, Math.max(0, limit));
}
