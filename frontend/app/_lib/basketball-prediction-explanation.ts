import type { BBGame, BBOverview, BBPrediction } from "./basketball-types";

export type PredictionExplanationSide = {
  side: "home" | "away";
  team: string;
  league: number;
  ownOffense: number;
  opponentDefense: number;
  venue: number;
  efficiency: number;
  projectedScore: number;
};

export type PredictionExplanation = {
  paceBaseline: number;
  home: PredictionExplanationSide;
  away: PredictionExplanationSide;
};

type ExplanationModel = Pick<BBOverview["model"], "teams" | "efficiency" | "tempo">;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Rebuild the published score equation from the exact coefficient arrays.
 * Returning null on any mismatch keeps an older model artifact from being
 * presented as an explanation for a newer forecast edition.
 */
export function explainBasketballPrediction(
  model: ExplanationModel | null | undefined,
  game: Pick<BBGame, "home_id" | "away_id" | "home_name" | "away_name" | "neutral">,
  prediction: Pick<BBPrediction, "home_score" | "away_score" | "pace">,
): PredictionExplanation | null {
  if (!model || !Array.isArray(model.teams) || !Array.isArray(model.efficiency) || !Array.isArray(model.tempo)) return null;
  const homeIndex = model.teams.indexOf(game.home_id);
  const awayIndex = model.teams.indexOf(game.away_id);
  const teamCount = model.teams.length;
  if (homeIndex < 0 || awayIndex < 0 || homeIndex === awayIndex) return null;
  if (model.efficiency.length < 2 + teamCount * 2 || model.tempo.length < teamCount + 1) return null;
  const coefficients = model.efficiency;
  const tempo = model.tempo;
  const values = [
    coefficients[0],
    coefficients[1],
    coefficients[homeIndex + 2],
    coefficients[awayIndex + 2],
    coefficients[homeIndex + teamCount + 2],
    coefficients[awayIndex + teamCount + 2],
    tempo[0],
    tempo[homeIndex + 1],
    tempo[awayIndex + 1],
    prediction.home_score,
    prediction.away_score,
    prediction.pace,
  ];
  if (values.some((value) => !finite(value))) return null;

  const venue = game.neutral ? 0 : coefficients[1] / 2;
  const paceBaseline = tempo[0] + tempo[homeIndex + 1] + tempo[awayIndex + 1];
  const homeEfficiency = coefficients[0] + coefficients[homeIndex + 2] + coefficients[awayIndex + teamCount + 2] + venue;
  const awayEfficiency = coefficients[0] + coefficients[awayIndex + 2] + coefficients[homeIndex + teamCount + 2] - venue;
  const homeScore = homeEfficiency * paceBaseline / 100;
  const awayScore = awayEfficiency * paceBaseline / 100;
  // Forecast payloads are rounded to two decimals. A larger difference means
  // the coefficient arrays and forecast came from different editions.
  if (Math.abs(homeScore - prediction.home_score) > 0.05 || Math.abs(awayScore - prediction.away_score) > 0.05 || Math.abs(paceBaseline - prediction.pace) > 0.05) return null;

  return {
    paceBaseline,
    home: {
      side: "home",
      team: game.home_name,
      league: coefficients[0],
      ownOffense: coefficients[homeIndex + 2],
      opponentDefense: coefficients[awayIndex + teamCount + 2],
      venue,
      efficiency: homeEfficiency,
      projectedScore: homeScore,
    },
    away: {
      side: "away",
      team: game.away_name,
      league: coefficients[0],
      ownOffense: coefficients[awayIndex + 2],
      opponentDefense: coefficients[homeIndex + teamCount + 2],
      venue: venue === 0 ? 0 : -venue,
      efficiency: awayEfficiency,
      projectedScore: awayScore,
    },
  };
}
