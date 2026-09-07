export type FootballProduction = {
  plays: number | null;
  yards: number | null;
  epa: number | null;
  epa_per_play: number | null;
  touchdowns: number | null;
  rank: number | null;
};

export type FootballPlayerProduction = {
  categories: string[];
  production: Record<string, FootballProduction>;
};

/** Select the source row that the player index should display. */
export function productionForCategory(
  player: FootballPlayerProduction,
  category: string,
) {
  if (category !== "all") {
    const stats = player.production[category];
    return stats ? { category, stats } : null;
  }
  const available = player.categories
    .map((key) => ({ category: key, stats: player.production[key] }))
    .filter(
      (row): row is { category: string; stats: FootballProduction } =>
        !!row.stats,
    );
  return (
    available
      .filter((row) => row.stats.rank != null)
      .sort(
        (a, b) =>
          (a.stats.rank ?? Number.POSITIVE_INFINITY) -
            (b.stats.rank ?? Number.POSITIVE_INFINITY) ||
          a.category.localeCompare(b.category),
      )[0] ||
    available.sort(
      (a, b) =>
        (b.stats.plays ?? -1) - (a.stats.plays ?? -1) ||
        a.category.localeCompare(b.category),
    )[0] ||
    null
  );
}

export function hasRankedProduction(
  player: FootballPlayerProduction,
  category: string,
) {
  return productionForCategory(player, category)?.stats.rank != null;
}
