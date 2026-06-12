export type TeamListItem = {
  id: string;
  orgId?: number;
  sportId?: string;
  sportCode?: string;
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
  sportCode?: string;
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
