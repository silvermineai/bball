import type { BBTeam } from "./basketball-types";

/**
 * Resolve the exact source team IDs used by a forecast to their published
 * prior-season rating rows. Name matching is intentionally not supported:
 * names can collide or change while the source ID is the model's identity.
 */
export function matchupTeamRatings(
  ratings: BBTeam[],
  homeId: string,
  awayId: string,
  modelTeamIds?: ReadonlySet<string>,
): { home: BBTeam | null; away: BBTeam | null } {
  const byId = new Map(
    ratings
      .filter((rating) => !modelTeamIds || modelTeamIds.has(rating.id))
      .map((rating) => [rating.id, rating] as const),
  );
  return {
    home: byId.get(homeId) || null,
    away: byId.get(awayId) || null,
  };
}
