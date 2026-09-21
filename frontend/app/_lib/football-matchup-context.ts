import type { FootballRecruitingTeam } from "./football-recruiting-context";

export type FootballMatchupContextFormat = "number" | "percent" | "rank";
export type FootballMatchupContextEdge = "away" | "home" | "even" | "unavailable";

export type FootballMatchupContextRow = {
  key: string;
  label: string;
  format: FootballMatchupContextFormat;
  direction: "higher" | "lower";
  away: number | null;
  home: number | null;
  edge: FootballMatchupContextEdge;
};

/** Render the directional read using the metric's actual better direction. */
export function footballMatchupContextEdgeLabel(
  row: Pick<FootballMatchupContextRow, "direction" | "edge">,
): string {
  if (row.edge === "even") return "Even";
  if (row.edge === "unavailable") return "Unavailable";
  const side = row.edge === "home" ? "Home" : "Away";
  return `${side} ${row.direction === "lower" ? "lower · stronger" : "higher"}`;
}

const finite = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Build a side-by-side, exact-team-ID context packet for a matchup card.
 * These are descriptive personnel fields; callers must keep them separate
 * from the primary forecast until they are fitted and validated as features.
 */
export function footballMatchupContextRows(
  away?: FootballRecruitingTeam,
  home?: FootballRecruitingTeam,
): FootballMatchupContextRow[] {
  const definitions: Array<{
    key: string;
    label: string;
    format: FootballMatchupContextFormat;
    direction: "higher" | "lower";
    get: (team?: FootballRecruitingTeam) => number | null;
  }> = [
    { key: "talent_composite", label: "Talent composite", format: "number", direction: "higher", get: (team) => finite(team?.talent_composite) },
    { key: "talent_rank", label: "Talent rank", format: "rank", direction: "lower", get: (team) => finite(team?.talent_rank) },
    { key: "blue_chip_ratio", label: "Blue-chip ratio", format: "percent", direction: "higher", get: (team) => finite(team?.blue_chip_ratio) },
    { key: "overall_returning", label: "Overall returning", format: "percent", direction: "higher", get: (team) => finite(team?.overall_returning) },
    { key: "off_returning", label: "Offense returning", format: "percent", direction: "higher", get: (team) => finite(team?.off_returning) },
    { key: "def_returning", label: "Defense returning", format: "percent", direction: "higher", get: (team) => finite(team?.def_returning) },
  ];
  return definitions.map(({ key, label, format, direction, get }) => {
    const awayValue = get(away);
    const homeValue = get(home);
    let edge: FootballMatchupContextEdge = "unavailable";
    if (awayValue != null && homeValue != null) {
      if (awayValue === homeValue) edge = "even";
      else if (direction === "higher") edge = homeValue > awayValue ? "home" : "away";
      else edge = homeValue < awayValue ? "home" : "away";
    }
    return { key, label, format, direction, away: awayValue, home: homeValue, edge };
  });
}
