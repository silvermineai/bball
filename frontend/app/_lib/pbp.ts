export type PbpGame = {
  id: string;
  date: string | null;
  home: string | null;
  away: string | null;
  home_id?: string;
  away_id?: string;
  events: number;
  scoring_plays: number;
  shooting_plays: number;
  shot_attempts?: number | null;
  completed?: boolean;
  matched_schedule?: boolean;
};

export type PbpSeason = {
  season: number;
  generated_at: string;
  source: { fetched_at: string; url: string; sha256: string };
  coverage: Record<string, number | null>;
  games: PbpGame[];
};

export type PbpCatalog = {
  schema_version: number;
  default_season: number;
  seasons: PbpSeason[];
};

export type PbpFilters = { season: number; query: string };

export function parsePbpFilters(
  search: string,
  defaultSeason: number,
  seasons: number[],
): PbpFilters {
  const params = new URLSearchParams(search);
  const requested = Number(params.get("season"));
  return {
    season: Number.isInteger(requested) && seasons.includes(requested) ? requested : defaultSeason,
    query: params.get("q") || "",
  };
}

export function pbpFilterSearch(filters: PbpFilters, defaultSeason: number) {
  const params = new URLSearchParams();
  if (filters.season !== defaultSeason) params.set("season", String(filters.season));
  if (filters.query.trim()) params.set("q", filters.query.trim());
  const query = params.toString();
  return query ? `?${query}` : "";
}
