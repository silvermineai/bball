import type { Forecast } from "./data";

export type FootballMatchupSignal = "all" | "toss-up" | "lean" | "strong";

const signals = new Set<FootballMatchupSignal>([
  "all",
  "toss-up",
  "lean",
  "strong",
]);

export function parseFootballMatchupSignal(value: string | null): FootballMatchupSignal {
  return value && signals.has(value as FootballMatchupSignal)
    ? value as FootballMatchupSignal
    : "all";
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
