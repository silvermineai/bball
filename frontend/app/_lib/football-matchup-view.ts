import type { Forecast } from "./data";

export type FootballMatchupSignal = "all" | "toss-up" | "lean" | "strong";
export type FootballMatchupSort =
  | "date"
  | "confidence"
  | "close"
  | "margin"
  | "uncertainty";
export type FootballMatchupDivision = "d1" | "d2" | "d3";

export function parseFootballMatchupDivision(value: string | null): FootballMatchupDivision {
  if (value === "2" || value === "d2" || value === "ii" || value === "d-ii") return "d2";
  if (value === "3" || value === "d3" || value === "iii" || value === "d-iii") return "d3";
  return "d1";
}

export function matchesFootballMatchupDivision(
  game: { home_division?: string | null; away_division?: string | null },
  division: FootballMatchupDivision,
) {
  const sourceDivisions = [game.home_division, game.away_division]
    .map((value) => String(value || "").trim().toLowerCase());
  if (division === "d2") return sourceDivisions.some((value) => value === "d2" || value === "ii" || value === "d-ii" || value === "division ii");
  if (division === "d3") return sourceDivisions.some((value) => value === "d3" || value === "iii" || value === "d-iii" || value === "division iii");
  return sourceDivisions.some((value) => value === "fbs" || value === "fcs" || value === "d1" || value === "i" || value === "division i");
}

const signals = new Set<FootballMatchupSignal>([
  "all",
  "toss-up",
  "lean",
  "strong",
]);
const sorts = new Set<FootballMatchupSort>([
  "date",
  "confidence",
  "close",
  "margin",
  "uncertainty",
]);

export function parseFootballMatchupSignal(value: string | null): FootballMatchupSignal {
  return value && signals.has(value as FootballMatchupSignal)
    ? value as FootballMatchupSignal
    : "all";
}

export function parseFootballMatchupSort(value: string | null): FootballMatchupSort {
  return value && sorts.has(value as FootballMatchupSort)
    ? value as FootballMatchupSort
    : "date";
}

/** Use the same confidence bands as the basketball matchup desk. */
export function matchesFootballMatchupSignal(
  prediction: Forecast | null | undefined,
  signal: FootballMatchupSignal,
) {
  if (signal === "all") return true;
  if (!prediction) return false;
  const confidence = Math.max(
    prediction.home_win_probability,
    1 - prediction.home_win_probability,
  );
  if (signal === "toss-up") return confidence < 0.6;
  if (signal === "lean") return confidence >= 0.6 && confidence < 0.75;
  return confidence >= 0.75;
}

export function sortFootballMatchups<T extends {
  kickoff: string;
  prediction: Forecast | null | undefined;
}>(games: T[], sort: FootballMatchupSort) {
  return games
    .map((game, index) => ({ game, index }))
    .sort((a, b) => {
      const ap = a.game.prediction;
      const bp = b.game.prediction;
      if (sort !== "date" && (ap != null) !== (bp != null)) {
        return ap != null ? -1 : 1;
      }
      let result = 0;
      if (sort === "date") {
        result = a.game.kickoff.localeCompare(b.game.kickoff);
      } else if (ap && bp) {
        if (sort === "confidence") {
          result = Math.max(bp.home_win_probability, 1 - bp.home_win_probability) - Math.max(ap.home_win_probability, 1 - ap.home_win_probability);
        } else if (sort === "close") {
          result = Math.abs(ap.home_margin) - Math.abs(bp.home_margin);
        } else if (sort === "margin") {
          result = Math.abs(bp.home_margin) - Math.abs(ap.home_margin);
        } else if (sort === "uncertainty") {
          result = (bp.margin_high - bp.margin_low) - (ap.margin_high - ap.margin_low);
        }
      }
      return result || a.game.kickoff.localeCompare(b.game.kickoff) || a.index - b.index;
    })
    .map(({ game }) => game);
}
