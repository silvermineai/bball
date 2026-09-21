export type DivisionCoverageSport = "basketball" | "football";
export type DivisionCoverageGender = "men" | "women";
export type LowerDivision = "2" | "3";
export type DivisionCoverageSurface = "players" | "teams" | "matches" | "rankings" | "predictions" | "recruiting";
export type DivisionCoverageState = "recorded" | "unavailable";

export type DivisionCoverageRow = {
  surface: DivisionCoverageSurface;
  label: string;
  state: DivisionCoverageState;
  note: string;
};

const surfaces: Array<[DivisionCoverageSurface, string]> = [
  ["players", "Players"],
  ["teams", "Teams"],
  ["matches", "Matches"],
  ["rankings", "Rankings"],
  ["predictions", "Predictions"],
  ["recruiting", "Recruiting"],
];

/**
 * Return only division-scoped release states. A schedule signal without an
 * explicit division label does not become a recorded match surface here.
 */
export function divisionCoverage(
  sport: DivisionCoverageSport,
  gender: DivisionCoverageGender,
  division: LowerDivision,
): DivisionCoverageRow[] {
  const recorded = sport === "football" && gender === "men"
    ? new Set<DivisionCoverageSurface>(["teams", "matches", "rankings", "predictions"])
    : sport === "basketball" && gender === "men"
      ? new Set<DivisionCoverageSurface>(["players", "teams", "matches", "rankings"])
      : new Set<DivisionCoverageSurface>();
  return surfaces.map(([surface, label]) => ({
    surface,
    label,
    state: recorded.has(surface) ? "recorded" : "unavailable",
    note: recorded.has(surface)
      ? surface === "matches"
        ? `Retained Division ${division} schedule rows and completed score results.`
        : sport === "football" && gender === "men" && surface === "teams"
          ? `Source-derived Division ${division} W–L, points-for and points-against records from complete scores.`
        : sport === "football" && gender === "men" && surface === "rankings"
            ? `Observed Division ${division} record board sorted from retained team records; no opponent-adjusted power rating is inferred.`
            : sport === "football" && gender === "men" && surface === "predictions"
              ? `Exact-division Division ${division} ratings and upcoming forecasts are published only after their history and calibration gates pass.`
              : surface === "rankings"
              ? `Within-division recorded fields for Division ${division}.`
              : `Validated Division ${division} ${surface} archive rows.`
      : sport === "basketball" && gender === "women" && surface === "players"
        ? `No stable-ID Division ${division} player archive. Source-native leaderboard rows are displayed separately with names and team slugs only.`
        : `No validated Division ${division} ${surface} release.`,
  }));
}
