import type { SportScope } from "./sport-scope";

export type LowerFootballDivision = "2" | "3";

/**
 * Lower football divisions currently have schedule rows and score-derived
 * team records in the retained edition. Keep the boundary explicit so UI
 * links never imply complete national player-stat coverage or opponent-adjusted
 * ratings. The retained lower-division event archive does provide exact-ID
 * observed production rows, so the public scope describes those rows as
 * partial rather than unavailable.
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
    playerStats: "partial" as const,
    teamStats: true,
    rankings: true,
    // The current retained lower-division release has independently gated
    // exact-division ratings and upcoming forecasts for both D2 and D3.
    predictions: true,
  } as const;
}
