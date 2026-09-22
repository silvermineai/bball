import type { BBGame, BBPrediction } from "../../_lib/basketball-types";

export type UpcomingGameLesson = {
  game: BBGame;
  prediction: BBPrediction;
  favoriteName: string | null;
  marginReading: "both-outcomes" | "one-side";
  forecastReading: "close" | "lean" | "strong";
  learningRead: ForecastLearningRead;
};

export type ForecastLearningRead = {
  favoriteName: string | null;
  favoriteProbability: number;
  otherProbability: number;
  marginWidth: number;
  intervalReading: "both-outcomes" | "one-side";
  probabilityReading: string;
  uncertaintyReading: string;
  studyPrompt: string;
};

const finitePrediction = (prediction: BBPrediction | null | undefined) =>
  Boolean(
    prediction &&
      [
        prediction.home_score,
        prediction.away_score,
        prediction.home_margin,
        prediction.total,
        prediction.pace,
        prediction.home_win_probability,
        prediction.margin_low,
        prediction.margin_high,
      ].every((value) => typeof value === "number" && Number.isFinite(value)),
  );

/**
 * Turn the stored probability and calibrated margin range into a plain
 * language reading for the learning page. This is descriptive arithmetic
 * over the published forecast; it does not add a forecast or treat the
 * probability as a market line.
 */
export function forecastLearningRead(
  homeName: string,
  awayName: string,
  prediction: BBPrediction,
): ForecastLearningRead | null {
  if (
    !finitePrediction(prediction) ||
    prediction.home_win_probability < 0 ||
    prediction.home_win_probability > 1 ||
    prediction.margin_low > prediction.margin_high ||
    prediction.home_margin < prediction.margin_low ||
    prediction.home_margin > prediction.margin_high ||
    prediction.pace <= 0
  ) {
    return null;
  }

  const homeProbability = prediction.home_win_probability;
  const awayProbability = 1 - homeProbability;
  const tied = homeProbability === 0.5;
  const favoriteName = tied ? null : homeProbability > 0.5 ? homeName : awayName;
  const favoriteProbability = tied ? 0.5 : Math.max(homeProbability, awayProbability);
  const otherProbability = tied ? 0.5 : Math.min(homeProbability, awayProbability);
  const marginWidth = prediction.margin_high - prediction.margin_low;
  const intervalReading =
    prediction.margin_low <= 0 && prediction.margin_high >= 0
      ? "both-outcomes"
      : "one-side";
  const probabilityReading = tied
    ? "The model is even: each team has a 50.0% win estimate."
    : `${favoriteName} has a ${(favoriteProbability * 100).toFixed(1)}% model win estimate; the other outcome remains ${(otherProbability * 100).toFixed(1)}%.`;
  const uncertaintyReading =
    intervalReading === "both-outcomes"
      ? `The ${marginWidth.toFixed(1)}-point home-margin span includes both teams winning (${prediction.margin_low.toFixed(1)} to ${prediction.margin_high.toFixed(1)}).`
      : `The ${marginWidth.toFixed(1)}-point home-margin span stays on one side of zero (${prediction.margin_low.toFixed(1)} to ${prediction.margin_high.toFixed(1)}).`;
  const studyPrompt =
    intervalReading === "both-outcomes"
      ? "Because the range includes both winners, identify the first possession-level signal that would move your read toward one team."
      : "Because the range stays on one side, identify the matchup event most likely to break that one-sided baseline.";

  return {
    favoriteName,
    favoriteProbability,
    otherProbability,
    marginWidth,
    intervalReading,
    probabilityReading,
    uncertaintyReading,
    studyPrompt,
  };
}

/**
 * Select the first usable forecast from the published schedule. The lesson
 * intentionally uses the same primary/fallback precedence as the matchup
 * notebook and refuses incomplete rows instead of filling missing values.
 */
export function nextUpcomingGameLesson(
  games: BBGame[],
): UpcomingGameLesson | null {
  const game = [...games]
    .filter((candidate) => {
      const prediction = candidate.prediction || candidate.fallback_prediction;
      return Boolean(
        prediction &&
          forecastLearningRead(candidate.home_name, candidate.away_name, prediction),
      );
    })
    .sort(
      (a, b) =>
        a.starts_at.localeCompare(b.starts_at) ||
        a.away_name.localeCompare(b.away_name) ||
        a.id.localeCompare(b.id),
    )[0];
  if (!game) return null;
  const prediction = (game.prediction || game.fallback_prediction)!;
  const learningRead = forecastLearningRead(game.home_name, game.away_name, prediction);
  if (!learningRead) return null;
  const favoriteName =
    prediction.home_margin > 0
      ? game.home_name
      : prediction.home_margin < 0
        ? game.away_name
        : null;
  const probability = prediction.home_win_probability;
  return {
    game,
    prediction,
    favoriteName,
    marginReading:
      prediction.margin_low <= 0 && prediction.margin_high >= 0
        ? "both-outcomes"
        : "one-side",
    forecastReading:
      Math.max(probability, 1 - probability) < 0.6
        ? "close"
        : Math.max(probability, 1 - probability) < 0.75
          ? "lean"
          : "strong",
    learningRead,
  };
}
