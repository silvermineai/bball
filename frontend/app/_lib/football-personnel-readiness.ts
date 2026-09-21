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
