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
    ? new Set<DivisionCoverageSurface>(["matches"])
    : sport === "basketball" && gender === "men"
      ? new Set<DivisionCoverageSurface>(["players", "teams", "rankings"])
      : new Set<DivisionCoverageSurface>();
  return surfaces.map(([surface, label]) => ({
    surface,
    label,
    state: recorded.has(surface) ? "recorded" : "unavailable",
    note: recorded.has(surface)
      ? surface === "matches"
        ? `Retained Division ${division} schedule rows.`
        : surface === "rankings"
          ? `Within-division recorded fields for Division ${division}.`
          : `Validated Division ${division} ${surface} archive rows.`
      : `No validated Division ${division} ${surface} release.`,
  }));
}
