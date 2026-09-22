export type ShootingMapSelection = {
  playerId: string;
  teamId: string;
};

/**
 * Read the exact archive identity used by the court-coordinate endpoint.
 * Keeping the team ID beside the player ID matters when a player has more
 * than one retained team row in the same season.
 */
export function readShootingMapSelection(params: Pick<URLSearchParams, "get">): ShootingMapSelection | null {
  const playerId = params.get("mapPlayer")?.trim() || "";
  const teamId = params.get("mapTeam")?.trim() || "";
  return playerId && teamId ? { playerId, teamId } : null;
}

/** Keep a shared shooting URL focused on a row's validated archive identity. */
export function writeShootingMapSelection(params: URLSearchParams, selection: ShootingMapSelection | null) {
  if (selection) {
    params.set("mapPlayer", selection.playerId);
    params.set("mapTeam", selection.teamId);
  } else {
    params.delete("mapPlayer");
    params.delete("mapTeam");
  }
  return params;
}
