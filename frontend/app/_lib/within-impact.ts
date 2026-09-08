export type WithinImpactSort = "rank" | "rapm_net" | "rapm_off" | "rapm_def" | "possessions";
export type WithinImpactFilters = {
  season: number;
  query: string;
  minPoss: string;
  sort: WithinImpactSort;
};

const sorts = new Set<WithinImpactSort>(["rank", "rapm_net", "rapm_off", "rapm_def", "possessions"]);
const thresholds = new Set(["0", "200", "500", "1000", "1500"]);

export function parseWithinImpactFilters(search: string, seasons: number[], fallback: number): WithinImpactFilters {
  const params = new URLSearchParams(search);
  const season = Number(params.get("season"));
  const requestedSort = params.get("sort") as WithinImpactSort | null;
  const minPoss = params.get("minPoss") || "500";
  return {
    season: Number.isInteger(season) && seasons.includes(season) ? season : fallback,
    query: params.get("q") || "",
    minPoss: thresholds.has(minPoss) ? minPoss : "500",
    sort: requestedSort && sorts.has(requestedSort) ? requestedSort : "rank",
  };
}

export function withinImpactFilterSearch(filters: WithinImpactFilters, fallback: number) {
  const params = new URLSearchParams();
  if (filters.season !== fallback) params.set("season", String(filters.season));
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.minPoss !== "500") params.set("minPoss", filters.minPoss);
  if (filters.sort !== "rank") params.set("sort", filters.sort);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export type WithinImpactRow = {
  season: number;
  player_id: string;
  person_id: string | null;
  team_id: string;
  team: string;
  player_code: string;
  player: string;
  rapm_off: number | null;
  rapm_def: number | null;
  rapm_net: number | null;
  team_off_poss: number | null;
  num_players: number;
  qualified: boolean;
  rank: number | null;
};
export type WithinImpactEdition = {
  season: number;
  generated_at: string;
  source: Record<string, unknown>;
  coverage: { source_rows: number; players: number; teams: number; qualified: number; minimum_possessions: number; edition: string };
  methodology: string;
  players: WithinImpactRow[];
};

export function sortWithinImpact(rows: WithinImpactRow[], sort: WithinImpactSort) {
  return [...rows].sort((a, b) => {
    if (sort === "rank") return (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || (b.rapm_net ?? -Infinity) - (a.rapm_net ?? -Infinity) || a.player.localeCompare(b.player);
    const value = (row: WithinImpactRow) => sort === "possessions" ? row.team_off_poss : row[sort];
    const delta = (value(b) ?? -Infinity) - (value(a) ?? -Infinity);
    return delta || a.player.localeCompare(b.player) || a.team.localeCompare(b.team);
  });
}
