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
