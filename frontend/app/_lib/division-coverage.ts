export type DivisionCoverageSport = "basketball" | "football";
export type DivisionCoverageGender = "men" | "women";
export type LowerDivision = "2" | "3";
export type DivisionCoverageSurface = "players" | "teams" | "matches" | "rankings" | "predictions" | "recruiting";
/**
 * `partial` is used when a source-native subset is published while a fuller
 * canonical release remains gated.  Keeping this distinct from `recorded`
 * prevents an observed event archive from being presented as a complete
 * national player-stat edition.
 */
export type DivisionCoverageState = "recorded" | "partial" | "unavailable";

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
      : sport === "basketball" && gender === "women"
        ? new Set<DivisionCoverageSurface>(["teams", "matches"])
        : new Set<DivisionCoverageSurface>();
  const partial = sport === "football" && gender === "men"
    ? new Set<DivisionCoverageSurface>(["players"])
    : sport === "basketball" && gender === "women"
      ? new Set<DivisionCoverageSurface>(["players", "rankings"])
      : new Set<DivisionCoverageSurface>();
  return surfaces.map(([surface, label]) => ({
    surface,
    label,
    state: recorded.has(surface) ? "recorded" : partial.has(surface) ? "partial" : "unavailable",
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
        ? `Source-native Division ${division} leaderboard rows are published with names and team slugs; stable athlete IDs remain unavailable.`
      : sport === "basketball" && gender === "women" && surface === "rankings"
        ? `Descriptive within-division record rankings are derived from receipt-backed NCAA contest finals; they are not an opponent-adjusted model.`
      : partial.has(surface)
        ? `Observed exact-ID Division ${division} player production from retained game summaries is published; the canonical national player-stat edition remains separately gated and missing categories are not treated as zero.`
        : `No validated Division ${division} ${surface} release.`,
  }));
}
