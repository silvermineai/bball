export type PossessionStyleRow = {
  season: number;
  team_id: string;
  team_name: string;
  games: number;
  possessions: number;
  points: number;
  points_per_possession: number | null;
  possessions_per_game: number | null;
  transition_share: number | null;
  assisted_share: number | null;
  garbage_time_share: number | null;
};

export type PossessionStyleEdition = {
  season: number;
  edition: string;
  generated_at: string;
  source: { url?: string; fetched_at?: string; sha256?: string };
  coverage: {
    source_rows: number;
    teams: number;
    games: number;
    invalid_points?: number;
    invalid_flag_rows?: number;
  };
  teams: Omit<PossessionStyleRow, "season">[];
};

export type PossessionStyleCatalog = {
  version: number;
  generated_at: string;
  seasons: PossessionStyleEdition[];
};

export type PossessionStyleSort = "possessions" | "ppp" | "transition" | "assisted" | "garbage" | "name";

export function styleValue(row: PossessionStyleRow, sort: PossessionStyleSort): number | string | null {
  if (sort === "name") return row.team_name;
  if (sort === "possessions") return row.possessions;
  if (sort === "ppp") return row.points_per_possession;
  if (sort === "transition") return row.transition_share;
  if (sort === "assisted") return row.assisted_share;
  return row.garbage_time_share;
}

export function filterAndSortStyle(
  rows: PossessionStyleRow[],
  query: string,
  sort: PossessionStyleSort,
  direction: "asc" | "desc",
) {
  const needle = query.trim().toLowerCase();
  return rows
    .filter((row) => !needle || `${row.team_name} ${row.team_id}`.toLowerCase().includes(needle))
    .slice()
    .sort((a, b) => {
      const av = styleValue(a, sort), bv = styleValue(b, sort);
      if (typeof av === "string" && typeof bv === "string") return direction === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      if (av == null && bv == null) return a.team_name.localeCompare(b.team_name);
      if (av == null) return 1;
      if (bv == null) return -1;
      const delta = Number(av) - Number(bv);
      return (direction === "asc" ? delta : -delta) || a.team_name.localeCompare(b.team_name);
    });
}
