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

export type FootballSourceBoxMetric = {
  key: string;
  label: string;
};

/**
 * Rankable exact-ID counting fields retained in each source-box category.
 * Percentage and per-opportunity fields stay visible in the table but are not
 * ranked without a source-defined qualification threshold.
 */
const sourceBoxMetricMap: Partial<Record<FootballPlayerCategory, FootballSourceBoxMetric[]>> = {
  defensive: [
    { key: "tackles", label: "Tackles" },
    { key: "solo_tackles", label: "Solo tackles" },
    { key: "tackles_for_loss", label: "Tackles for loss" },
    { key: "sacks", label: "Sacks" },
    { key: "passes_defended", label: "Passes defended" },
    { key: "hurries", label: "Quarterback hurries" },
    { key: "defensive_touchdowns", label: "Defensive touchdowns" },
  ],
  interceptions: [
    { key: "interceptions", label: "Interceptions" },
    { key: "interception_yards", label: "Interception return yards" },
    { key: "interception_touchdowns", label: "Interception touchdowns" },
  ],
  fumbles: [
    { key: "fumbles_recovered", label: "Fumbles recovered" },
  ],
  kicking: [
    { key: "total_kicking_points", label: "Kicking points" },
    { key: "field_goals_made", label: "Field goals made" },
    { key: "extra_points_made", label: "Extra points made" },
  ],
  punting: [
    { key: "punt_yards", label: "Punt yards" },
    { key: "punts_inside_20", label: "Punts inside the 20" },
    { key: "long_punt", label: "Longest punt" },
  ],
  kickReturns: [
    { key: "kick_return_yards", label: "Kick-return yards" },
    { key: "kick_returns", label: "Kick returns" },
    { key: "kick_return_touchdowns", label: "Kick-return touchdowns" },
    { key: "long_kick_return", label: "Longest kick return" },
  ],
  puntReturns: [
    { key: "punt_return_yards", label: "Punt-return yards" },
    { key: "punt_returns", label: "Punt returns" },
    { key: "punt_return_touchdowns", label: "Punt-return touchdowns" },
    { key: "long_punt_return", label: "Longest punt return" },
  ],
};

export function footballSourceBoxMetrics(category: FootballPlayerCategory) {
  return sourceBoxMetricMap[category] ?? [];
}

export function footballSourceBoxMetric(category: FootballPlayerCategory): string | null {
  return footballSourceBoxMetrics(category)[0]?.key ?? null;
}

/** Keep a requested metric inside the selected source category. */
export function resolveFootballSourceBoxMetric(
  category: FootballPlayerCategory,
  requested: string | null | undefined,
) {
  const metrics = footballSourceBoxMetrics(category);
  return metrics.find((metric) => metric.key === requested) ?? metrics[0] ?? null;
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
  metric: string;
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
  const resolvedMetric = resolveFootballSourceBoxMetric(
    category && footballPlayerCategories.includes(category) ? category : "passing",
    params.get("metric"),
  );
  return {
    season,
    category:
      category && footballPlayerCategories.includes(category) ? category : "passing",
    division: division === "fcs" || division === "all" ? division : "fbs",
    query: params.get("q") || "",
    qualified: params.get("qualified") === "1",
    sort: requestedSort && footballPlayerSorts.includes(requestedSort) ? requestedSort : "rank",
    metric: resolvedMetric?.key ?? "",
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
  const defaultMetric = footballSourceBoxMetric(filters.category);
  if (filters.metric && filters.metric !== defaultMetric) params.set("metric", filters.metric);
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
  team?: string | null;
  conference?: string | null;
  division: string;
};

export type FootballPlayerComparison = FootballRankablePlayer & {
  selectedCategory: string;
  stats: FootballProduction;
};

export function footballPlayerRankKey(playerId: string, teamId: string, category: string) {
  return `${playerId}:${teamId}:${category}`;
}

/**
 * Assign competition ranks after callers sort rows by their recorded value.
 * Stable name/ID ordering may order exact ties on screen, but it must never
 * turn equal evidence into different ranks.
 */
function competitionRankMap<T>(
  rows: T[],
  value: (row: T) => number,
  key: (row: T) => string,
) {
  let priorValue: number | null = null;
  let rank = 0;
  return new Map(rows.map((row, index) => {
    const currentValue = value(row);
    if (priorValue == null || currentValue !== priorValue) {
      rank = index + 1;
      priorValue = currentValue;
    }
    return [key(row), rank] as const;
  }));
}

/**
 * Resolve a small, exact-ID comparison set for the player board.  The board
 * can contain multiple team-season rows for the same athlete, so callers pass
 * the player/team key rather than an athlete ID alone.  Missing categories are
 * omitted instead of being rendered as zeroes.
 */
export function compareFootballPlayers(
  players: FootballRankablePlayer[],
  keys: string[],
  category: FootballPlayerCategory | string,
) {
  return keys.flatMap((key): FootballPlayerComparison[] => {
    const separator = key.indexOf(":");
    if (separator < 1) return [];
    const id = key.slice(0, separator);
    const teamId = key.slice(separator + 1);
    const player = players.find((row) => row.id === id && row.team_id === teamId);
    if (!player) return [];
    const selected = productionForCategory(player, category);
    return selected?.stats ? [{ ...player, selectedCategory: selected.category, stats: selected.stats }] : [];
  });
}

/** Rank exact-ID source-box totals within the selected FBS/FCS cohort. */
export function computeSourceBoxRanks(
  players: FootballRankablePlayer[],
  category: FootballPlayerCategory,
  division: FootballPlayerDivision = "all",
  requestedMetric?: string | null,
) {
  const metric = resolveFootballSourceBoxMetric(category, requestedMetric)?.key;
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
  return competitionRankMap(
    rows,
    (row) => row.value,
    (row) => footballPlayerRankKey(row.player.id, row.player.team_id, category),
  );
}

type FcsRankBasis = "total_epa" | "source_box_yards";

function eligibleFcsRankRows(
  players: FootballRankablePlayer[],
  category: string,
  minimumPlays: Record<string, number | undefined>,
) {
  return players.flatMap((player) => {
    if (player.division !== "fcs") return [];
    const categories = category === "all" ? player.categories : [category];
    return categories.flatMap((selected) => {
      const stats = player.production[selected];
      const minimum = minimumPlays[selected];
      return stats && minimum != null && (stats.plays ?? 0) >= minimum
        ? [{ player, category: selected, epa: stats.epa, yards: stats.yards }]
        : [];
    });
  });
}

/**
 * Name the one comparable measure used for the complete FCS ranking cohort.
 * Yards are a board-level fallback only when no eligible row has retained EPA;
 * EPA and yards are never compared as if they shared a unit.
 */
export function footballFcsRankingBasis(
  players: FootballRankablePlayer[],
  category: string,
  minimumPlays: Record<string, number | undefined>,
): FcsRankBasis | null {
  const rows = eligibleFcsRankRows(players, category, minimumPlays);
  if (rows.some((row) => row.epa != null && Number.isFinite(row.epa))) return "total_epa";
  if (rows.some((row) => row.yards != null && Number.isFinite(row.yards))) return "source_box_yards";
  return null;
}

/**
 * Rank retained FCS production locally because the source board only assigns
 * publisher ranks to FBS rows. Retained EPA is used when the qualified cohort
 * contains it; exact-ID source-box yards are used only when EPA is unavailable
 * for the entire cohort. The result is separate from the source rank and
 * limited to scope, so unlike measures can never enter one rank order.
 */
export function computeFcsEpaRanks(
  players: FootballRankablePlayer[],
  category: string,
  minimumPlays: Record<string, number | undefined>,
) {
  const eligible = eligibleFcsRankRows(players, category, minimumPlays);
  const basis = footballFcsRankingBasis(players, category, minimumPlays);
  if (!basis) return new Map<string, number>();
  const rows = eligible.flatMap((row) => {
    const value = basis === "total_epa" ? row.epa : row.yards;
    return value != null && Number.isFinite(value) ? [{ ...row, value }] : [];
  });
  rows.sort((left, right) =>
    right.value - left.value ||
    left.player.name.localeCompare(right.player.name) ||
    left.player.id.localeCompare(right.player.id) ||
    left.player.team_id.localeCompare(right.player.team_id) ||
    left.category.localeCompare(right.category),
  );
  return competitionRankMap(
    rows,
    (row) => row.value,
    (row) => footballPlayerRankKey(row.player.id, row.player.team_id, row.category),
  );
}

/**
 * Rank an in-progress season by observed total EPA when the publisher has not
 * assigned a qualified source rank yet.  This is deliberately separate from
 * the retained source rank and has no minimum-play claim; callers must label
 * it as provisional and keep the season's sample warning visible.
 */
export function computeProvisionalProductionRanks(
  players: FootballRankablePlayer[],
  category: string,
  division: FootballPlayerDivision = "all",
) {
  const rows = players.flatMap((player) => {
    if (player.division !== "fbs" && player.division !== "fcs") return [];
    if (division !== "all" && player.division !== division) return [];
    const selected = category === "all"
      ? productionForCategory(player, category)
      : player.production[category]
        ? { category, stats: player.production[category] }
        : null;
    const epa = selected?.stats.epa;
    return selected && epa != null && Number.isFinite(epa) && (selected.stats.plays ?? 0) > 0
      ? [{ player, category: selected.category, epa }]
      : [];
  });
  rows.sort((left, right) =>
    right.epa - left.epa ||
    left.player.name.localeCompare(right.player.name) ||
    left.player.id.localeCompare(right.player.id) ||
    left.player.team_id.localeCompare(right.player.team_id) ||
    left.category.localeCompare(right.category),
  );
  return competitionRankMap(
    rows,
    (row) => row.epa,
    (row) => footballPlayerRankKey(row.player.id, row.player.team_id, row.category),
  );
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
