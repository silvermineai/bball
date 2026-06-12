export interface Conference {
  id: string;
  name: string;
  division: string;
}

export interface Team {
  id: string;
  name: string;
  mascot: string;
  abbreviation: string;
  conference: Conference;
  city: string;
  state: string;
  arena: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  currentRecord: {
    wins: number;
    losses: number;
    conferenceWins: number;
    conferenceLosses: number;
  };
  kenpomRank?: number;
  netRank?: number;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jerseyNumber: string;
  position: Position;
  height: string;
  weight: number;
  class: PlayerClass;
  hometown: string;
  highSchool: string;
  teamId: string;
  photoUrl?: string;
  stats: PlayerStats;
}

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C' | 'G' | 'F';
export type PlayerClass = 'Freshman' | 'Sophomore' | 'Junior' | 'Senior' | 'Graduate';

export interface PlayerStats {
  season: string;
  gamesPlayed: number;
  gamesStarted: number;
  minutesPerGame: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  fieldGoalPercentage: number;
  threePointersMade: number;
  threePointersAttempted: number;
  threePointPercentage: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  freeThrowPercentage: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  totalRebounds: number;
  reboundsPerGame: number;
  assists: number;
  assistsPerGame: number;
  steals: number;
  stealsPerGame: number;
  blocks: number;
  blocksPerGame: number;
  turnovers: number;
  turnoversPerGame: number;
  personalFouls: number;
  foulsPerGame: number;
  points: number;
  pointsPerGame: number;
  efficiency: number;
}

export interface Game {
  id: string;
  date: Date;
  season: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  status: GameStatus;
  venue: string;
  attendance?: number;
  isConferenceGame: boolean;
  isNeutralSite: boolean;
  boxScore?: BoxScore;
  playByPlay?: PlayByPlayEvent[];
}

export type GameStatus = 'scheduled' | 'in_progress' | 'final' | 'postponed' | 'cancelled';

export interface BoxScore {
  gameId: string;
  homeTeamStats: TeamGameStats;
  awayTeamStats: TeamGameStats;
  homePlayerStats: PlayerGameStats[];
  awayPlayerStats: PlayerGameStats[];
}

export interface TeamGameStats {
  teamId: string;
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  fieldGoalPercentage: number;
  threePointersMade: number;
  threePointersAttempted: number;
  threePointPercentage: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  freeThrowPercentage: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  totalRebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  personalFouls: number;
  technicalFouls: number;
  fastBreakPoints: number;
  pointsInPaint: number;
  secondChancePoints: number;
  benchPoints: number;
}

export interface PlayerGameStats {
  playerId: string;
  player: Player;
  minutes: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  totalRebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  personalFouls: number;
  points: number;
  plusMinus: number;
}

export interface PlayByPlayEvent {
  id: string;
  gameId: string;
  period: number;
  time: string;
  teamId?: string;
  playerId?: string;
  eventType: PlayEventType;
  description: string;
  homeScore: number;
  awayScore: number;
}

export type PlayEventType = 
  | 'made_shot' 
  | 'missed_shot' 
  | 'made_three' 
  | 'missed_three'
  | 'made_free_throw'
  | 'missed_free_throw'
  | 'offensive_rebound'
  | 'defensive_rebound'
  | 'assist'
  | 'steal'
  | 'block'
  | 'turnover'
  | 'foul'
  | 'technical_foul'
  | 'timeout'
  | 'substitution'
  | 'jump_ball'
  | 'period_start'
  | 'period_end';

export interface AdvancedStats {
  teamId: string;
  season: string;
  offensiveEfficiency: number;
  defensiveEfficiency: number;
  netEfficiency: number;
  pace: number;
  effectiveFieldGoalPercentage: number;
  turnoverPercentage: number;
  offensiveReboundPercentage: number;
  freeThrowRate: number;
  trueShootingPercentage: number;
  assistPercentage: number;
  stealPercentage: number;
  blockPercentage: number;
  usageRate?: number;
}

export interface Matchup {
  team1Id: string;
  team2Id: string;
  team1: Team;
  team2: Team;
  historicalGames: Game[];
  team1Stats: MatchupStats;
  team2Stats: MatchupStats;
  predictions?: MatchupPrediction;
}

export interface MatchupStats {
  wins: number;
  losses: number;
  averagePoints: number;
  averagePointsAllowed: number;
  averageRebounds: number;
  averageAssists: number;
  averageTurnovers: number;
  shootingPercentage: number;
  threePointPercentage: number;
  lastFiveGames: Game[];
}

export interface MatchupPrediction {
  predictedWinner: string;
  winProbability: number;
  predictedScore: {
    team1: number;
    team2: number;
  };
  keyFactors: string[];
  confidence: number;
}