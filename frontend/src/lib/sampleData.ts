import type { GameListItem, PlayerListItem, PlayerSummary, Shot, TeamListItem } from "@/types";

export const sampleTeams: TeamListItem[] = [
  { id: "t_sampleucon", sportCode: "MBB", sportId: "s_mbb", name: "UConn Huskies", record: "4-0", games: 1, pointsFor: 86, pointsAgainst: 84 },
  { id: "t_samplebyuc", sportCode: "MBB", sportId: "s_mbb", name: "BYU Cougars", record: "3-1", games: 1, pointsFor: 84, pointsAgainst: 86 },
  { id: "t_sampleduke", sportCode: "MBB", sportId: "s_mbb", name: "Duke Blue Devils", record: "0-0", games: 0, pointsFor: 0, pointsAgainst: 0 },
  { id: "t_samplekans", sportCode: "MBB", sportId: "s_mbb", name: "Kansas Jayhawks", record: "0-0", games: 0, pointsFor: 0, pointsAgainst: 0 },
];

export const sampleGames: GameListItem[] = [
  {
    id: "c_samplegame",
    sportId: "s_mbb",
    sportCode: "MBB",
    date: "2025-11-15T19:00:00",
    venue: "TD Garden (Boston, MA)",
    awayTeam: "BYU Cougars",
    homeTeam: "UConn Huskies",
    awayScore: 84,
    homeScore: 86,
    result: "W 86-84",
  },
];

export const samplePlayers: PlayerListItem[] = [
  { id: "p_samplekara", sportCode: "MBB", name: "Alex Karaban", teamName: "UConn Huskies", position: "F", games: 1, ppg: 23, rpg: 2, apg: 2, fga: 12, threeFga: 6 },
  { id: "p_samplereed", sportCode: "MBB", name: "Tarris Reed Jr.", teamName: "UConn Huskies", position: "F", games: 1, ppg: 21, rpg: 8, apg: 2, fga: 10, threeFga: 0 },
  { id: "p_samplewrig", sportCode: "MBB", name: "Robert Wright III", teamName: "BYU Cougars", position: "G", games: 1, ppg: 16, rpg: 0, apg: 4, fga: 12, threeFga: 6 },
  { id: "p_sampledyba", sportCode: "MBB", name: "AJ Dybantsa", teamName: "BYU Cougars", position: "F", games: 1, ppg: 25, rpg: 7, apg: 1, fga: 18, threeFga: 5 },
];

export const sampleShots: Shot[] = [
  { id: 1, contestId: 6422772, x: 7, y: 44, made: true, isThree: false, playerId: 10007040, playerName: "Robert Wright III", clock: "19:35" },
  { id: 2, contestId: 6422772, x: 92, y: 45, made: true, isThree: false, playerId: 9324572, playerName: "Alex Karaban", clock: "16:40" },
  { id: 3, contestId: 6422772, x: 81, y: 49, made: false, isThree: true, playerId: 9324572, playerName: "Alex Karaban", clock: "14:02" },
  { id: 4, contestId: 6422772, x: 93, y: 54, made: true, isThree: false, playerId: 9324580, playerName: "Tarris Reed Jr.", clock: "02:29" },
  { id: 5, contestId: 6422772, x: 29, y: 26, made: true, isThree: true, playerId: 9324572, playerName: "Alex Karaban", clock: "08:31" },
  { id: 6, contestId: 6422772, x: 22, y: 87, made: false, isThree: true, playerId: 10007040, playerName: "Robert Wright III", clock: "15:52" },
];

export const sampleSummary: PlayerSummary = {
  games: 1,
  ppg: 23,
  rpg: 2,
  apg: 2,
  fgm: 8,
  fga: 12,
  threeFgm: 4,
  threeFga: 6,
  ftm: 3,
  fta: 4,
  turnovers: 1,
  steals: 0,
  blocks: 0,
};
