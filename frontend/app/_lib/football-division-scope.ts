import type { SportScope } from "./sport-scope";

export type LowerFootballDivision = "2" | "3";

/**
 * Lower football divisions currently have schedule rows in the retained
 * edition. Keep this boundary explicit so UI links never imply player or
 * team-stat coverage that has not passed the release checks.
 */
export function lowerFootballDivision(
  sport: "basketball" | "football",
  scope: SportScope,
): LowerFootballDivision | null {
  if (sport !== "football" || scope.gender !== "men") return null;
  return scope.division === "2" || scope.division === "3" ? scope.division : null;
}

export function footballDivisionAvailability(division: LowerFootballDivision) {
  return {
    division,
    scheduleRows: true,
    playerStats: false,
    teamStats: false,
    rankings: false,
    predictions: false,
  } as const;
}
