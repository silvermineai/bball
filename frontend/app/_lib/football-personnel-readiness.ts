import type { Game, FootballPersonnelReadiness } from "./data";

export type FootballPersonnelReadinessGame = FootballPersonnelReadiness["games"][number];

/** The fields in the research release, in the order used on matchup cards. */
const DEFINITIONS = [
  { key: "talent_composite", label: "Talent composite", format: "number" as const, direction: "higher" as const },
  { key: "talent_rank", label: "Talent rank", format: "rank" as const, direction: "lower" as const },
  { key: "blue_chip_ratio", label: "Blue-chip ratio", format: "percent" as const, direction: "higher" as const },
  { key: "overall_returning", label: "Overall returning", format: "percent" as const, direction: "higher" as const },
  { key: "off_returning", label: "Offense returning", format: "percent" as const, direction: "higher" as const },
  { key: "def_returning", label: "Defense returning", format: "percent" as const, direction: "higher" as const },
] as const;

export type FootballPersonnelReadinessRow = {
  key: (typeof DEFINITIONS)[number]["key"];
  label: string;
  format: "number" | "percent" | "rank";
  direction: "higher" | "lower";
  away: number | null;
  home: number | null;
  edge: "away" | "home" | "even" | "unavailable";
};

export type FootballPersonnelDivisionCoverage = {
  division: "d1" | "d2" | "d3";
  scheduled: number;
  complete: number;
  partial: number;
  conflict: number;
  unavailable: number;
  missing: number;
};

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Join only by game ID and both exact team IDs; a mismatched row is withheld. */
export function personnelReadinessForGame(
  games: FootballPersonnelReadinessGame[],
  game: Pick<Game, "id" | "home_id" | "away_id">,
): FootballPersonnelReadinessGame | null {
  const row = games.find((candidate) => candidate.game_id === game.id);
  if (!row || row.home_id !== game.home_id || row.away_id !== game.away_id) return null;
  return row;
}

export function footballPersonnelReadinessRows(
  game: FootballPersonnelReadinessGame,
): FootballPersonnelReadinessRow[] {
  return DEFINITIONS.map(({ key, label, format, direction }) => {
    const away = finite(game.away[key]);
    const home = finite(game.home[key]);
    let edge: FootballPersonnelReadinessRow["edge"] = "unavailable";
    if (away != null && home != null) {
      if (away === home) edge = "even";
      else if (direction === "higher") edge = home > away ? "home" : "away";
      else edge = home < away ? "home" : "away";
    }
    return { key, label, format, direction, away, home, edge };
  });
}

export function personnelReadinessStatusLabel(status: FootballPersonnelReadinessGame["status"]): string {
  switch (status) {
    case "complete": return "Complete context";
    case "partial": return "Partial context";
    case "conflict": return "Conflicting source rows";
    case "unavailable": return "Context unavailable";
  }
}

function normalizedDivision(value: unknown): FootballPersonnelDivisionCoverage["division"] | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["fbs", "fcs", "d1", "division1", "divisioni"].includes(normalized)) return "d1";
  if (["d2", "division2", "divisionii"].includes(normalized)) return "d2";
  if (["d3", "division3", "divisioniii"].includes(normalized)) return "d3";
  return null;
}

/**
 * Reconcile personnel context to the upcoming slate using the same exact
 * game and team IDs as the matchup cards. A missing row remains missing; it
 * is never counted as unavailable context from a source response.
 */
export function footballPersonnelCoverageByDivision(
  games: Array<Pick<Game, "id" | "home_id" | "away_id" | "home_division" | "away_division">>,
  readinessGames: FootballPersonnelReadinessGame[],
): FootballPersonnelDivisionCoverage[] {
  const rows: FootballPersonnelDivisionCoverage[] = (["d1", "d2", "d3"] as const).map((division) => ({
    division,
    scheduled: 0,
    complete: 0,
    partial: 0,
    conflict: 0,
    unavailable: 0,
    missing: 0,
  }));
  const byDivision = new Map(rows.map((row) => [row.division, row]));
  for (const game of games) {
    const homeDivision = normalizedDivision(game.home_division);
    const awayDivision = normalizedDivision(game.away_division);
    const row = homeDivision && homeDivision === awayDivision ? byDivision.get(homeDivision) : undefined;
    if (!row) continue;
    row.scheduled += 1;
    const readiness = personnelReadinessForGame(readinessGames, game);
    if (!readiness) {
      row.missing += 1;
      continue;
    }
    row[readiness.status] += 1;
  }
  return rows;
}
