import type { BBOverview } from "../_lib/basketball-types";

export type NotebookModelValidation = {
  testSeason: number;
  games: number;
  marginMae: number;
  winnerAccuracy: number;
  intervalCoverage: number;
  baselineMarginMae: number;
  trainingSeasons: number[];
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Keep the accountability card tied to a complete, bounded evaluation row.
 * A missing or malformed field must not turn an incomplete model artifact into
 * a confidence claim on an upcoming game.
 */
export function notebookModelValidation(
  evaluation: BBOverview["model"]["evaluation"] | null | undefined,
  trainingSeasons: unknown,
): NotebookModelValidation | null {
  if (!evaluation || typeof evaluation !== "object") return null;
  const values = [
    evaluation.season,
    evaluation.games,
    evaluation.margin_mae,
    evaluation.winner_accuracy,
    evaluation.interval_coverage,
    evaluation.baseline_margin_mae,
  ];
  if (
    values.some((value) => !finite(value)) ||
    !Number.isInteger(evaluation.season) ||
    !Number.isInteger(evaluation.games) ||
    evaluation.games <= 0 ||
    evaluation.margin_mae < 0 ||
    evaluation.baseline_margin_mae < 0 ||
    evaluation.winner_accuracy < 0 ||
    evaluation.winner_accuracy > 1 ||
    evaluation.interval_coverage < 0 ||
    evaluation.interval_coverage > 1 ||
    !Array.isArray(trainingSeasons) ||
    trainingSeasons.length === 0 ||
    trainingSeasons.some((season) => !Number.isInteger(season) || season < 1900)
  ) {
    return null;
  }
  return {
    testSeason: evaluation.season,
    games: evaluation.games,
    marginMae: evaluation.margin_mae,
    winnerAccuracy: evaluation.winner_accuracy,
    intervalCoverage: evaluation.interval_coverage,
    baselineMarginMae: evaluation.baseline_margin_mae,
    trainingSeasons: [...trainingSeasons],
  };
}
