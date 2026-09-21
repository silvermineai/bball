import type { WomensPlayerStats } from "./womens-player-detail";

export type WomensSeasonPlayerRecord = {
  player_id: string;
  name: string;
  team: string;
  position: string;
  stats: WomensPlayerStats;
};

export type WomensBoxPlayerRecord = {
  player_id: string;
  name: string;
  team: string;
  team_id: string;
  teams?: Array<{ team_id: string; team: string }>;
  position: string;
  box_rows: number;
  dnp_rows: number;
  games_played: number;
  starts: number;
  totals: Record<string, number>;
  per_game: Record<string, number>;
  shooting: {
    field_goal_pct: number | null;
    three_point_pct: number | null;
    free_throw_pct: number | null;
  };
};

export type WomensPlayerProfile = {
  player_id: string;
  name: string;
  team: string;
  position: string;
  season: WomensSeasonPlayerRecord | null;
  box: WomensBoxPlayerRecord | null;
};

/**
 * Join the two women's player releases by their exact publisher athlete ID.
 * A missing row remains missing; names are never used as a fallback key.
 */
export function findWomensPlayerProfile(
  playerId: string,
  seasonPlayers: WomensSeasonPlayerRecord[],
  boxPlayers: WomensBoxPlayerRecord[],
): WomensPlayerProfile | null {
  const id = String(playerId || "").trim();
  if (!id) return null;
  const season = seasonPlayers.find((player) => String(player.player_id) === id) || null;
  const box = boxPlayers.find((player) => String(player.player_id) === id) || null;
  if (!season && !box) return null;
  return {
    player_id: id,
    name: season?.name || box?.name || `Player ${id}`,
    team: season?.team || box?.team || "Team unavailable",
    position: season?.position || box?.position || "",
    season,
    box,
  };
}

/** Return a finite source value without turning a missing field into zero. */
export function finiteWomensProfileValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const womensBoxTotalFields = [
  ["minutes", "Minutes"],
  ["points", "Points"],
  ["rebounds", "Rebounds"],
  ["offensive_rebounds", "Offensive rebounds"],
  ["defensive_rebounds", "Defensive rebounds"],
  ["assists", "Assists"],
  ["steals", "Steals"],
  ["blocks", "Blocks"],
  ["turnovers", "Turnovers"],
  ["fouls", "Fouls"],
  ["field_goals_made", "Field goals made"],
  ["field_goals_attempted", "Field goals attempted"],
  ["three_point_field_goals_made", "3-point makes"],
  ["three_point_field_goals_attempted", "3-point attempts"],
  ["free_throws_made", "Free throws made"],
  ["free_throws_attempted", "Free throws attempted"],
] as const;

export const womensBoxPerGameFields = [
  ["minutes", "Minutes / game"],
  ["points", "Points / game"],
  ["rebounds", "Rebounds / game"],
  ["assists", "Assists / game"],
  ["steals", "Steals / game"],
  ["blocks", "Blocks / game"],
  ["turnovers", "Turnovers / game"],
  ["fouls", "Fouls / game"],
] as const;
