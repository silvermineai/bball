import type { BBPrediction, BBTeam } from "./basketball-types";

export type MatchupPaceLens = {
  projected: number;
  prior_home: number;
  prior_away: number;
  prior_mean: number;
  projected_delta: number;
  home_delta: number;
  away_delta: number;
  tempo_gap: number;
  faster_team: "home" | "away" | "even";
  environment: "faster" | "slower" | "near_prior";
};

function finitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Put a published pace beside the exact-ID prior-season tempo rows already
 * attached to a matchup card. This is descriptive game-script context: it
 * does not recalculate or alter the registered forecast.
 */
export function matchupPaceLens(
  prediction: Pick<BBPrediction, "pace"> | null | undefined,
  homeRating: Pick<BBTeam, "adj_tempo"> | null | undefined,
  awayRating: Pick<BBTeam, "adj_tempo"> | null | undefined,
): MatchupPaceLens | null {
  if (!prediction || !finitePositive(prediction.pace) || !finitePositive(homeRating?.adj_tempo) || !finitePositive(awayRating?.adj_tempo)) {
    return null;
  }
  const priorMean = (homeRating.adj_tempo + awayRating.adj_tempo) / 2;
  const projectedDelta = prediction.pace - priorMean;
  const tempoGap = homeRating.adj_tempo - awayRating.adj_tempo;
  return {
    projected: prediction.pace,
    prior_home: homeRating.adj_tempo,
    prior_away: awayRating.adj_tempo,
    prior_mean: priorMean,
    projected_delta: projectedDelta,
    home_delta: prediction.pace - homeRating.adj_tempo,
    away_delta: prediction.pace - awayRating.adj_tempo,
    tempo_gap: tempoGap,
    faster_team: Math.abs(tempoGap) < 0.05 ? "even" : tempoGap > 0 ? "home" : "away",
    environment: projectedDelta > 1.5 ? "faster" : projectedDelta < -1.5 ? "slower" : "near_prior",
  };
}
