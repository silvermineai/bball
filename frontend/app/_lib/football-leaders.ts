export type LeaderProduction = {
  plays: number | null;
  yards: number | null;
  touchdowns: number | null;
  epa: number | null;
  epa_per_play: number | null;
  rank: number | null;
};

export type LeaderPlayer = {
  id: string;
  name: string;
  team: string;
  conference: string;
  division: string;
  production: Record<string, LeaderProduction>;
};

export type FootballLeader = LeaderProduction & {
  id: string;
  name: string;
  team: string;
  conference: string;
  category: string;
};

export type SourceBoxLeaderPlayer = {
  id: string;
  name: string;
  team: string;
  team_id?: string;
  conference: string;
  division: string;
  production: Record<string, { metrics?: Record<string, number> }>;
};

export type FootballSourceBoxLeader = {
  id: string;
  name: string;
  team: string;
  team_id?: string;
  conference: string;
  division: string;
  category: string;
  metric: string;
  value: number;
  rank: number;
};

/**
 * Rank one exact-ID source-box metric within one source category. The metric
 * is selected by the caller so unlike defensive, kicking and punting units
 * never enter a shared ranking or composite score.
 */
export function topFootballSourceBoxLeaders(
  players: SourceBoxLeaderPlayer[],
  category: string,
  metric: string,
  limit = 6,
): FootballSourceBoxLeader[] {
  const rows = players.flatMap((player) => {
    const value = player.production[category]?.metrics?.[metric];
    return value != null && Number.isFinite(value)
      ? [{ ...player, category, metric, value }]
      : [];
  }).sort((a, b) =>
    b.value - a.value ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id) ||
    (a.team_id || "").localeCompare(b.team_id || ""),
  );
  let previousValue: number | null = null;
  let rank = 0;
  return rows.slice(0, Math.max(0, limit)).map((row, index) => {
    if (previousValue == null || row.value !== previousValue) {
      rank = index + 1;
      previousValue = row.value;
    }
    return { ...row, rank };
  });
}

export function topFootballLeaders(
  players: LeaderPlayer[],
  category: string,
  limit = 5,
) {
  return players
    .map((player) => {
      const production = player.production[category];
      return production
        ? {
            ...production,
            id: player.id,
            name: player.name,
            team: player.team,
            conference: player.conference,
            category,
          }
        : null;
    })
    .filter((row): row is FootballLeader => row?.rank != null)
    .sort(
      (a, b) =>
        (a.rank ?? Number.POSITIVE_INFINITY) -
          (b.rank ?? Number.POSITIVE_INFINITY) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}
