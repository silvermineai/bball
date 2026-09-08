export type MatchupStintSort = "possessions" | "net_per_100" | "games" | "date";
export type MatchupStintFilters = {
  season: number;
  query: string;
  minPoss: string;
  sort: MatchupStintSort;
};

const sorts = new Set<MatchupStintSort>(["possessions", "net_per_100", "games", "date"]);
const thresholds = new Set(["0", "20", "40", "100", "200"]);

export function parseMatchupStintFilters(search: string, seasons: number[], fallback: number): MatchupStintFilters {
  const params = new URLSearchParams(search);
  const season = Number(params.get("season"));
  const requestedSort = params.get("sort") as MatchupStintSort | null;
  const minPoss = params.get("minPoss") || "40";
  return {
    season: Number.isInteger(season) && seasons.includes(season) ? season : fallback,
    query: params.get("q") || "",
    minPoss: thresholds.has(minPoss) ? minPoss : "40",
    sort: requestedSort && sorts.has(requestedSort) ? requestedSort : "possessions",
  };
}

export function matchupStintFilterSearch(filters: MatchupStintFilters, fallback: number) {
  const params = new URLSearchParams();
  if (filters.season !== fallback) params.set("season", String(filters.season));
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.minPoss !== "40") params.set("minPoss", filters.minPoss);
  if (filters.sort !== "possessions") params.set("sort", filters.sort);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export type MatchupStint = {
  id: string;
  season: number;
  home: string;
  away: string;
  home_lineup: string[];
  away_lineup: string[];
  home_lineup_key: string;
  away_lineup_key: string;
  games: number;
  stints: number;
  duration_mins: number;
  events: number;
  possessions: number;
  home_points: number;
  away_points: number;
  net_per_100: number | null;
  home_per_100: number | null;
  away_per_100: number | null;
  last_date: string | null;
};

export type MatchupStintEdition = {
  season: number;
  generated_at: string;
  coverage: { source_rows: number; source_contests: number; source_matchups: number; source_possessions: number; published_matchups: number; truncated: boolean };
  matchups: MatchupStint[];
};

export function sortMatchupStints(rows: MatchupStint[], sort: MatchupStintSort) {
  return [...rows].sort((a, b) => {
    if (sort === "date") return (b.last_date || "").localeCompare(a.last_date || "") || b.possessions - a.possessions;
    const delta = (b[sort] as number) - (a[sort] as number);
    return delta || b.possessions - a.possessions || a.home.localeCompare(b.home) || a.id.localeCompare(b.id);
  });
}
