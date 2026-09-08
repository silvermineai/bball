export const playerIndexSorts = [
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
