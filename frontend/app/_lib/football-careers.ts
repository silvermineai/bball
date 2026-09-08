export const careerCategories = ["all", "passing", "rushing", "receiving", "defensive", "interceptions", "fumbles", "kicking", "punting", "kickReturns", "puntReturns"] as const;
export type CareerCategory = (typeof careerCategories)[number];

export type CareerProduction = { plays: number; yards: number; epa: number; epa_per_play: number | null; touchdowns: number; seasons: number[]; best_rank: number | null };
export type CareerTeam = { season: number; team_id: string; team: string; conference: string | null; division: string | null; box_games: number };
export type CareerPlayer = { id: string; name: string; first_season: number; last_season: number; seasons: number[]; season_count: number; box_games: number; categories: string[]; teams: CareerTeam[]; production: Partial<Record<Exclude<CareerCategory, "all">, CareerProduction>> };
export type CareerIndex = { schema_version: number; generated_at: string; source_catalog_edition: string | null; coverage: { seasons: number[]; source_records: number; player_count: number; production_records: number; identified_only: boolean }; methodology: string; players: CareerPlayer[] };
export type CareerFilters = { query: string; category: CareerCategory; division: "all" | "fbs" | "fcs"; minSeasons: number };

export function filterFootballCareers(players: CareerPlayer[], filters: CareerFilters) {
  const query = filters.query.trim().toLowerCase();
  return players.filter((player) => {
    if (player.season_count < filters.minSeasons) return false;
    if (filters.category !== "all" && !player.production[filters.category]) return false;
    const teams = filters.division === "all" ? player.teams : player.teams.filter((team) => team.division === filters.division);
    if (!teams.length) return false;
    if (!query) return true;
    return `${player.name} ${teams.map((team) => `${team.team} ${team.conference || ""}`).join(" ")}`.toLowerCase().includes(query);
  });
}

export type CareerSort = "epa" | "plays" | "seasons" | "games" | "name";
export function sortFootballCareers(players: CareerPlayer[], category: CareerCategory, sort: CareerSort) {
  return [...players].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    const value = (player: CareerPlayer) => sort === "seasons" ? player.season_count : sort === "games" ? player.box_games : category === "all" ? 0 : player.production[category]?.[sort === "plays" ? "plays" : "epa"] ?? Number.NEGATIVE_INFINITY;
    return value(b) - value(a) || b.season_count - a.season_count || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

export function careerFilterSearch(filters: CareerFilters, sort: CareerSort, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.category !== "passing") params.set("category", filters.category);
  if (filters.division !== "fbs") params.set("division", filters.division);
  if (filters.minSeasons !== 1) params.set("minSeasons", String(filters.minSeasons));
  if (sort !== "epa") params.set("sort", sort);
  if (page) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function parseCareerFilters(search: string) {
  const params = new URLSearchParams(search);
  const requested = params.get("category") as CareerCategory | null;
  const category = requested && careerCategories.includes(requested) ? requested : "passing";
  const division = params.get("division");
  const min = Number(params.get("minSeasons") || 1);
  const requestedSort = params.get("sort") as CareerSort | null;
  const sort: CareerSort = requestedSort && ["epa", "plays", "seasons", "games", "name"].includes(requestedSort) ? requestedSort : "epa";
  const page = Number(params.get("page") || 0);
  return { filters: { query: params.get("q") || "", category, division: division === "fcs" || division === "all" ? division : "fbs", minSeasons: [1, 2, 3, 4].includes(min) ? min : 1 } satisfies CareerFilters, sort, page: Number.isInteger(page) && page > 0 && page < 1000 ? page : 0 };
}
