export type FootballProduction = {
  games?: number | null;
  plays: number | null;
  yards: number | null;
  yards_per_play?: number | null;
  epa: number | null;
  epa_per_play: number | null;
  success_rate?: number | null;
  touchdowns: number | null;
  rank: number | null;
};

export const footballPlayerCategories = [
  "all",
  "passing",
  "rushing",
  "receiving",
  "defensive",
  "interceptions",
  "fumbles",
  "kicking",
  "punting",
  "kickReturns",
  "puntReturns",
] as const;
export type FootballPlayerCategory = (typeof footballPlayerCategories)[number];
export type FootballPlayerDivision = "fbs" | "all";

const footballEventCategoryMap: Partial<
  Record<FootballPlayerCategory, "defense" | "specialists">
> = {
  defensive: "defense",
  interceptions: "defense",
  fumbles: "defense",
  kicking: "specialists",
  punting: "specialists",
  kickReturns: "specialists",
  puntReturns: "specialists",
};

/** Return the source notebook for categories that do not have stable athlete IDs. */
export function footballEventDataset(category: FootballPlayerCategory) {
  return footballEventCategoryMap[category] ?? null;
}

export type FootballPlayerFilters = {
  season: string;
  category: FootballPlayerCategory;
  division: FootballPlayerDivision;
  query: string;
  qualified: boolean;
  page: number;
};

/** Read the football player board's shareable controls from a URL. */
export function parseFootballPlayerFilters(
  search: string,
  supportedSeasons: number[],
): FootballPlayerFilters {
  const params = new URLSearchParams(search);
  const requestedSeason = params.get("season");
  const season =
    requestedSeason && supportedSeasons.includes(Number(requestedSeason))
      ? requestedSeason
      : supportedSeasons.includes(2025)
        ? "2025"
        : String(supportedSeasons[0] ?? 2025);
  const category = params.get("category") as FootballPlayerCategory | null;
  const division = params.get("division");
  const page = Number(params.get("page") || 0);
  return {
    season,
    category:
      category && footballPlayerCategories.includes(category) ? category : "passing",
    division: division === "all" ? "all" : "fbs",
    query: params.get("q") || "",
    qualified: params.get("qualified") === "1",
    page: Number.isInteger(page) && page > 0 && page <= 250 ? page : 0,
  };
}

/** Serialize football player board controls without losing the selected slice. */
export function footballPlayerFilterSearch(filters: FootballPlayerFilters) {
  const params = new URLSearchParams();
  if (filters.season !== "2025") params.set("season", filters.season);
  if (filters.category !== "passing") params.set("category", filters.category);
  if (filters.division !== "fbs") params.set("division", filters.division);
  if (filters.query) params.set("q", filters.query);
  if (filters.qualified) params.set("qualified", "1");
  if (filters.page) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

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
