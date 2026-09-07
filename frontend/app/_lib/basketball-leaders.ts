export type BasketballLeaderMetric = "ppg" | "rpg" | "apg" | "ts";

export type BasketballLeaderPlayer = {
  id: string;
  name: string;
  team: string;
  position: string | null;
  games: number;
  minutes: number;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  ts: number | null;
  qualified: boolean;
};

export type BasketballLeader = BasketballLeaderPlayer & {
  metric: BasketballLeaderMetric;
  value: number;
  rank: number;
};

export function topBasketballLeaders(
  players: BasketballLeaderPlayer[],
  metric: BasketballLeaderMetric,
  limit = 5,
) {
  const sorted = players
    .filter((player) => player.qualified && player[metric] != null)
    .sort(
      (a, b) =>
        (b[metric] as number) - (a[metric] as number) ||
        a.name.localeCompare(b.name) ||
        a.team.localeCompare(b.team),
    );
  let rank = 0;
  let previous: number | null = null;
  return sorted.slice(0, limit).map((player, index) => {
    const value = player[metric] as number;
    if (value !== previous) rank = index + 1;
    previous = value;
    return { ...player, metric, value, rank };
  });
}
