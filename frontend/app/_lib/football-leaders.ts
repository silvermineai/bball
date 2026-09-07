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
