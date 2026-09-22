export type TeamListItem = {
  id: string;
  orgId?: number;
  sportId?: string;
  sportCode?: string;
  division?: string;
  name: string;
  record?: string;
  season?: string;
  games: number;
  pointsFor?: number;
  pointsAgainst?: number;
  isFavorite?: boolean;
};

export type GameListItem = {
  id: string;
  sportId?: string;
  sportCode?: string;
  division?: string;
  date?: string;
  venue?: string;
  awayTeam?: string;
  homeTeam?: string;
  awayScore?: number;
  homeScore?: number;
  result?: string;
};

export type PlayerListItem = {
  id: string;
  ncaaPlayerId?: string | number;
  sportCode?: string;
  division?: string;
  name: string;
  teamName?: string;
  statGroups?: string;
  games: number;
  ppg?: number;
  rpg?: number;
  apg?: number;
  position?: string;
  fga?: number;
  threeFga?: number;
  isFavorite?: boolean;
};

export type NcaaPlayerSeasonRow = {
  season: number;
  player_id: string;
  team_id?: string;
  team_name?: string;
  player_name?: string;
  games?: number;
  stats: Record<string, number | string | null>;
};

export type NcaaPlayerShootingRow = {
  season: number;
  player_id: string;
  team_id?: string;
  team_name?: string;
  player_name?: string;
  stats: Record<string, number | string | null>;
};

export type NcaaPlayerCard = {
  player_id: string;
  selected_season: number;
  seasons: NcaaPlayerSeasonRow[];
  shooting: NcaaPlayerShootingRow[];
  impact?: Record<string, number | string | null> | null;
  games?: Array<Record<string, unknown>>;
  game_stat_coverage?: Record<string, number | string | null>;
  source_receipts?: Array<{ dataset?: string; fetched_at?: string; url?: string | null; sha256?: string | null }>;
  identity_note?: string;
};

export type NcaaPlayerRanking = {
  metric: string;
  total: number;
  rows: Array<{ player_id: string; player_name?: string | null; value?: number | null; rank?: number | null }>;
};

export type Shot = {
  id: number;
  gameId?: string;
  contestId?: number;
  x: number;
  y: number;
  made: boolean | number;
  isThree?: boolean | number;
  shotValue?: number;
  playerId?: string | number;
  playerName?: string;
  teamName?: string;
  description?: string;
  period?: number;
  clock?: string;
};

export type PlayByPlayAction = {
  id: number;
  sequence: number;
  period: number;
  clock: string;
  teamName?: string;
  playerName?: string;
  playerId?: string;
  eventType: string;
  description: string;
  awayScore?: number;
  homeScore?: number;
};

export type PlayerGameStat = {
  contest_id: number;
  ncaa_player_id: number;
  playerId?: string;
  player_name: string;
  sportCode?: string;
  sport_code?: string;
  statGroup?: string;
  stat_group?: string;
  statsJson?: string;
  stats_json?: string;
  team_name?: string;
  position?: string;
  minutes?: string;
  points?: number;
  total_rebounds?: number;
  assists?: number;
  fgm?: number;
  fga?: number;
  three_fgm?: number;
  three_fga?: number;
  ftm?: number;
  fta?: number;
  turnovers?: number;
  steals?: number;
  blocks?: number;
};

export type PlayerSummary = {
  games: number;
  ppg?: number;
  rpg?: number;
  apg?: number;
  fgm?: number;
  fga?: number;
  threeFgm?: number;
  threeFga?: number;
  ftm?: number;
  fta?: number;
  turnovers?: number;
  steals?: number;
  blocks?: number;
};
