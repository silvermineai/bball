import type { BBRosterPlayerWatch } from "./basketball-types";

/** Keep the publisher's workload ordering and expose only the bounded watch list. */
export function rotationWatchRows(
  players: BBRosterPlayerWatch[] | null | undefined,
  limit = 5,
): BBRosterPlayerWatch[] {
  if (!Array.isArray(players)) return [];
  const boundedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 5;
  return players.slice(0, boundedLimit);
}

/**
 * Describe the exact-ID continuity state without inferring availability,
 * eligibility, role, or a future rotation from a missing roster row.
 */
export function rotationWatchStatus(player: Pick<BBRosterPlayerWatch, "returning" | "represented">): string {
  if (player.returning === true && player.represented === true) return "Returning · exact roster match";
  if (player.returning === true && player.represented === false) return "Returning · crosswalk incomplete";
  if (player.returning === false && player.represented === true) return "Observed at another program";
  if (player.returning === false && player.represented === false) return "No current roster match";
  return "Continuity unavailable";
}

export function rotationWatchNumber(value: number | null | undefined, decimals = 1): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(decimals) : "—";
}

export function rotationWatchPlayerHref(athleteId: string, season = 2026): string {
  return `/basketball/ncaa-player/?id=${encodeURIComponent(athleteId)}&season=${encodeURIComponent(String(season))}`;
}
