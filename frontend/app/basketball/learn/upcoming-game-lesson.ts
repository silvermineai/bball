import type { BBGame, BBPrediction } from "../../_lib/basketball-types";

export type UpcomingGameLesson = {
  game: BBGame;
  prediction: BBPrediction;
  favoriteName: string | null;
  marginReading: "both-outcomes" | "one-side";
  forecastReading: "close" | "lean" | "strong";
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
 * Select the first usable forecast from the published schedule. The lesson
 * intentionally uses the same primary/fallback precedence as the matchup
 * notebook and refuses incomplete rows instead of filling missing values.
 */
export function nextUpcomingGameLesson(
  games: BBGame[],
): UpcomingGameLesson | null {
  const game = [...games]
    .filter((candidate) => finitePrediction(candidate.prediction || candidate.fallback_prediction))
    .sort(
      (a, b) =>
        a.starts_at.localeCompare(b.starts_at) ||
        a.away_name.localeCompare(b.away_name) ||
        a.id.localeCompare(b.id),
    )[0];
  if (!game) return null;
  const prediction = (game.prediction || game.fallback_prediction)!;
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
  };
}
