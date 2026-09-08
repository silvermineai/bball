export type NcaaTeamBoxSort = "net_rtg" | "off_rtg" | "def_rtg" | "tempo" | "efg_pct" | "to_rate_derived" | "orb_pct" | "ft_rate" | "points";
export type NcaaTeamBoxFilters = { season: number; query: string; minGames: string; sort: NcaaTeamBoxSort; direction: "asc" | "desc" };
const sorts = new Set<NcaaTeamBoxSort>(["net_rtg", "off_rtg", "def_rtg", "tempo", "efg_pct", "to_rate_derived", "orb_pct", "ft_rate", "points"]);
const gameThresholds = new Set(["0", "10", "20", "30"]);
export function parseNcaaTeamBoxFilters(search: string, seasons: number[], fallback: number): NcaaTeamBoxFilters {
  const params = new URLSearchParams(search);
  const season = Number(params.get("season"));
  const sort = params.get("sort") as NcaaTeamBoxSort | null;
  const direction = params.get("direction");
  const minGames = params.get("minGames") || "10";
  return {
    season: Number.isInteger(season) && seasons.includes(season) ? season : fallback,
    query: params.get("q") || "",
    minGames: gameThresholds.has(minGames) ? minGames : "10",
    sort: sort && sorts.has(sort) ? sort : "net_rtg",
    direction: direction === "asc" ? "asc" : "desc",
  };
}
export function ncaaTeamBoxFilterSearch(filters: NcaaTeamBoxFilters, fallback: number) {
  const params = new URLSearchParams();
  if (filters.season !== fallback) params.set("season", String(filters.season));
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.minGames !== "10") params.set("minGames", filters.minGames);
  if (filters.sort !== "net_rtg") params.set("sort", filters.sort);
  if (filters.direction !== "desc") params.set("direction", filters.direction);
  const query = params.toString();
  return query ? `?${query}` : "";
}
export type NcaaTeamBoxRow = {
  season: number; team_id: string; espn_team_id: string | null; team: string; games: number; contests: number; possessions: number | null; points: number; points_allowed: number; off_rtg: number | null; def_rtg: number | null; net_rtg: number | null; tempo: number | null; efg_pct: number | null; def_efg_pct: number | null; ts_pct: number | null; def_ts_pct: number | null; to_rate_derived: number | null; def_to_rate_derived: number | null; orb_pct: number | null; def_orb_pct: number | null; ft_rate: number | null; def_ft_rate: number | null; three_rate: number | null; def_three_rate: number | null; net_rank: number; source_totals: Record<string, number>; source_averages: Record<string, number>;
};
export type NcaaTeamBoxEdition = { season: number; generated_at: string; source: Record<string, unknown>; coverage: { source_rows: number; teams: number; contests: number; edition: string }; methodology: string; teams: NcaaTeamBoxRow[] };
export function sortNcaaTeamBox(rows: NcaaTeamBoxRow[], sort: NcaaTeamBoxSort, direction: "asc" | "desc") {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sort] as number | null;
    const bv = b[sort] as number | null;
    return multiplier * ((av ?? -Infinity) - (bv ?? -Infinity)) || a.team.localeCompare(b.team);
  });
}
