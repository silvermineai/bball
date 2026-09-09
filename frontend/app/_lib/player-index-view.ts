export const playerIndexSorts = [
  "profile",
  "ppg",
  "rpg",
  "apg",
  "ts",
  "mpg",
  "spg",
  "bpg",
  "efg",
  "three_pct",
  "ft_rate",
  "three_rate",
  "tov_rate",
] as const;
export type PlayerIndexSort = (typeof playerIndexSorts)[number];
export type PlayerIndexFilters = {
  season: string;
  query: string;
  sort: PlayerIndexSort;
  qualified: boolean;
  page: number;
};

export type PlayerProfileMetric =
  | "ppg"
  | "rpg"
  | "apg"
  | "spg"
  | "bpg"
  | "ts"
  | "efg"
  | "tov_rate";
export type PlayerProfilePlayer = {
  id: string;
  team_id: string;
} & Record<PlayerProfileMetric, number | null>;
export type PlayerProfileScore = { score: number | null; components: number };

const profileMetrics: Array<{ key: PlayerProfileMetric; higherIsBetter: boolean }> = [
  { key: "ppg", higherIsBetter: true },
  { key: "rpg", higherIsBetter: true },
  { key: "apg", higherIsBetter: true },
  { key: "spg", higherIsBetter: true },
  { key: "bpg", higherIsBetter: true },
  { key: "ts", higherIsBetter: true },
  { key: "efg", higherIsBetter: true },
  { key: "tov_rate", higherIsBetter: false },
];

const profileKey = (player: { id: string; team_id: string }) => `${player.id}-${player.team_id}`;

const lowerBound = (values: number[], target: number) => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
};

const upperBound = (values: number[], target: number) => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] <= target) low = middle + 1;
    else high = middle;
  }
  return low;
};

/**
 * Return cohort-relative percentile scores for the retained player profile.
 * Each component is ranked within the supplied season/qualification cohort;
 * unavailable source fields are omitted and never converted into zero.
 */
export function playerProfileScores<T extends PlayerProfilePlayer>(players: T[]) {
  const scoreByMetric = new Map<PlayerProfileMetric, Map<string, number>>();
  for (const { key, higherIsBetter } of profileMetrics) {
    const values = players
      .map((player) => player[key])
      .filter((value): value is number => value != null && Number.isFinite(value))
      .sort((a, b) => a - b);
    const metricScores = new Map<string, number>();
    if (values.length > 1) {
      for (const player of players) {
        const value = player[key];
        if (value == null || !Number.isFinite(value)) continue;
        const below = lowerBound(values, value);
        const equal = upperBound(values, value) - below;
        const percentile = (below + Math.max(equal - 1, 0) / 2) / (values.length - 1);
        metricScores.set(profileKey(player), (higherIsBetter ? percentile : 1 - percentile) * 100);
      }
    }
    scoreByMetric.set(key, metricScores);
  }
  return new Map(players.map((player) => {
    const components = profileMetrics
      .map(({ key }) => scoreByMetric.get(key)?.get(profileKey(player)))
      .filter((value): value is number => value != null && Number.isFinite(value));
    return [profileKey(player), {
      score: components.length >= 4
        ? components.reduce((sum, value) => sum + value, 0) / components.length
        : null,
      components: components.length,
    } satisfies PlayerProfileScore];
  }));
}

/** Attach profile scores and tied ranks while preserving the source player row. */
export function rankPlayerProfiles<T extends PlayerProfilePlayer>(players: T[]) {
  const scores = playerProfileScores(players);
  const sorted = [...players].sort((a, b) => {
    const as = scores.get(profileKey(a))?.score ?? -Infinity;
    const bs = scores.get(profileKey(b))?.score ?? -Infinity;
    return bs - as || a.id.localeCompare(b.id) || a.team_id.localeCompare(b.team_id);
  });
  let rank = 0;
  let previous: number | null = null;
  return sorted.map((player, index) => {
    const profile = scores.get(profileKey(player))!;
    if (profile.score == null) rank = 0;
    else if (profile.score !== previous) rank = index + 1;
    previous = profile.score;
    return { ...player, statRank: profile.score == null ? null : rank, profileScore: profile.score, profileComponents: profile.components, profileRank: profile.score == null ? null : rank };
  });
}

/** Read the historical player index controls from a shareable URL. */
export function parsePlayerIndexFilters(
  search: string,
  supportedSeasons: number[],
): PlayerIndexFilters {
  const params = new URLSearchParams(search);
  const requestedSeason = params.get("season");
  const season =
    requestedSeason && supportedSeasons.includes(Number(requestedSeason))
      ? requestedSeason
      : supportedSeasons.includes(2026)
        ? "2026"
        : String(supportedSeasons[0] ?? 2026);
  const requestedSort = params.get("sort") as PlayerIndexSort | null;
  const page = Number(params.get("page") || 0);
  return {
    season,
    query: params.get("q") || "",
    sort: requestedSort && playerIndexSorts.includes(requestedSort) ? requestedSort : "ppg",
    qualified: params.get("qualified") !== "0",
    page: Number.isInteger(page) && page > 0 && page <= 250 ? page : 0,
  };
}

/** Serialize non-default player index controls for a compact handoff URL. */
export function playerIndexFilterSearch(filters: PlayerIndexFilters) {
  const params = new URLSearchParams();
  if (filters.season !== "2026") params.set("season", filters.season);
  if (filters.query) params.set("q", filters.query);
  if (filters.sort !== "ppg") params.set("sort", filters.sort);
  if (!filters.qualified) params.set("qualified", "0");
  if (filters.page) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
