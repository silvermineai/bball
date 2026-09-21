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
  source?: string;
  metrics?: Record<string, number>;
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
/** Native subdivisions present in the retained player editions. */
export type FootballPlayerDivision = "fbs" | "fcs" | "all";

/** Read the shared sport-desk scope before native FBS/FCS controls are applied. */
export function parseFootballPlayerScope(search: string) {
  const params = new URLSearchParams(search);
  const gender = params.get("gender");
  const division = params.get("division");
  return {
    gender: gender === "women" ? "women" : "men",
    division: division === "2" || division === "3" ? division : "1",
  } as const;
}
export const footballPlayerSorts = ["rank", "epa", "epa_per_play", "yards_per_play", "success_rate", "plays"] as const;
export type FootballPlayerSort = (typeof footballPlayerSorts)[number];

/**
 * Return an inclusive, cohort-relative percentile for an observed player
 * value.  The cohort is supplied by the caller so filters can define the
 * comparison set explicitly; unavailable and non-finite values are omitted.
 * This is a descriptive context measure, not a composite player grade.
 */
export function footballCohortPercentile(
  value: number | null | undefined,
  peers: Array<number | null | undefined>,
  direction: "higher" | "lower" = "higher",
) {
  if (value == null || !Number.isFinite(value)) return null;
  const values = peers.filter(
    (peer): peer is number => peer != null && Number.isFinite(peer),
  );
  if (!values.length) return null;
  const betterOrEqual = values.filter((peer) =>
    direction === "higher" ? peer <= value : peer >= value,
  ).length;
  return Math.round((betterOrEqual / values.length) * 1000) / 10;
}

/** Compute the same descriptive percentile for a whole cohort in O(n log n). */
export function footballCohortPercentiles(
  values: Array<number | null | undefined>,
  direction: "higher" | "lower" = "higher",
) {
  const sorted = values
    .filter((value): value is number => value != null && Number.isFinite(value))
    .sort((left, right) => left - right);
  const lowerBound = (value: number) => {
    let low = 0;
    let high = sorted.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (sorted[middle] < value) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const upperBound = (value: number) => {
    let low = 0;
    let high = sorted.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (sorted[middle] <= value) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  return values.map((value) => {
    if (value == null || !Number.isFinite(value) || !sorted.length) return null;
    const count = direction === "higher"
      ? upperBound(value)
      : sorted.length - lowerBound(value);
    return Math.round((count / sorted.length) * 1000) / 10;
  });
}

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

/** Exact-ID source-box field used for a transparent category order. */
const sourceBoxMetricMap: Partial<Record<FootballPlayerCategory, string>> = {
  defensive: "tackles",
  interceptions: "interceptions",
  fumbles: "fumbles_recovered",
  kicking: "total_kicking_points",
  punting: "punt_yards",
  kickReturns: "kick_return_yards",
  puntReturns: "punt_return_yards",
};

export function footballSourceBoxMetric(category: FootballPlayerCategory): string | null {
  return sourceBoxMetricMap[category] ?? null;
}

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
  sort: FootballPlayerSort;
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
  const requestedSort = params.get("sort") as FootballPlayerSort | null;
  return {
    season,
    category:
      category && footballPlayerCategories.includes(category) ? category : "passing",
    division: division === "fcs" || division === "all" ? division : "fbs",
    query: params.get("q") || "",
    qualified: params.get("qualified") === "1",
    sort: requestedSort && footballPlayerSorts.includes(requestedSort) ? requestedSort : "rank",
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
  if (filters.sort !== "rank") params.set("sort", filters.sort);
  if (filters.page) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export type FootballPlayerProduction = {
  categories: string[];
  production: Record<string, FootballProduction>;
};

export type FootballRankablePlayer = FootballPlayerProduction & {
  id: string;
  team_id: string;
  name: string;
  division: string;
};

export function footballPlayerRankKey(playerId: string, teamId: string, category: string) {
  return `${playerId}:${teamId}:${category}`;
}

/** Rank exact-ID source-box totals within the selected FBS/FCS cohort. */
export function computeSourceBoxRanks(
  players: FootballRankablePlayer[],
  category: FootballPlayerCategory,
  division: FootballPlayerDivision = "all",
) {
  const metric = footballSourceBoxMetric(category);
  if (!metric || category === "all") return new Map<string, number>();
  const rows = players.flatMap((player) => {
    if (player.division !== "fbs" && player.division !== "fcs") return [];
    if (division !== "all" && player.division !== division) return [];
    if (!player.categories.includes(category)) return [];
    const stats = player.production[category];
    const value = stats?.metrics?.[metric];
    return stats && value != null && Number.isFinite(value)
      ? [{ player, value }]
      : [];
  });
  rows.sort((left, right) =>
    right.value - left.value ||
    left.player.name.localeCompare(right.player.name) ||
    left.player.id.localeCompare(right.player.id) ||
    left.player.team_id.localeCompare(right.player.team_id),
  );
  return new Map(rows.map((row, index) => [footballPlayerRankKey(row.player.id, row.player.team_id, category), index + 1]));
}

/**
 * Rank retained FCS production locally because the source board only assigns
 * publisher ranks to FBS rows. EPA is preferred when present; exact-ID source
 * box yards provide a transparent fallback for FCS rows without an EPA
 * release. The result is separate from the source rank and limited to scope.
 */
export function computeFcsEpaRanks(
  players: FootballRankablePlayer[],
  category: string,
  minimumPlays: Record<string, number | undefined>,
) {
  const rows = players.flatMap((player) => {
    if (player.division !== "fcs") return [];
    const categories = category === "all" ? player.categories : [category];
    return categories.flatMap((selected) => {
      const stats = player.production[selected];
      const minimum = minimumPlays[selected];
      const value = stats?.epa ?? stats?.yards;
      return stats && minimum != null && (stats.plays ?? 0) >= minimum && value != null && Number.isFinite(value)
        ? [{ player, category: selected, epa: value }]
        : [];
    });
  });
  rows.sort((left, right) =>
    right.epa - left.epa ||
    left.player.name.localeCompare(right.player.name) ||
    left.player.id.localeCompare(right.player.id) ||
    left.player.team_id.localeCompare(right.player.team_id) ||
    left.category.localeCompare(right.category),
  );
  return new Map(rows.map((row, index) => [footballPlayerRankKey(row.player.id, row.player.team_id, row.category), index + 1]));
}

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
