import { describe, expect, it } from "vitest";
import { notebookModelValidation } from "./notebook-model-validation";

const evaluation = {
  season: 2026,
  games: 1_200,
  unscored_games: 0,
  margin_mae: 8.25,
  margin_rmse: 10.4,
  total_mae: 11.2,
  winner_accuracy: 0.71,
  brier: 0.19,
  log_loss: 0.56,
  interval_coverage: 0.81,
  baseline_margin_mae: 9.1,
  training_seasons: [2022, 2023, 2024, 2025],
};

describe("notebook model validation", () => {
  it("returns the complete held-out evaluation for an accountability card", () => {
    expect(notebookModelValidation(evaluation, evaluation.training_seasons)).toEqual({
      testSeason: 2026,
      games: 1_200,
      marginMae: 8.25,
      winnerAccuracy: 0.71,
      intervalCoverage: 0.81,
      baselineMarginMae: 9.1,
      trainingSeasons: [2022, 2023, 2024, 2025],
    });
  });

  it("withholds the card when a probability or training boundary is invalid", () => {
    expect(notebookModelValidation({ ...evaluation, interval_coverage: 1.2 }, [2022])).toBeNull();
    expect(notebookModelValidation(evaluation, [2022, 1899])).toBeNull();
    expect(notebookModelValidation({ ...evaluation, games: 0 }, [2022])).toBeNull();
  });

  it("does not accept non-finite metrics", () => {
    expect(notebookModelValidation({ ...evaluation, margin_mae: Number.NaN }, [2022])).toBeNull();
  });
});
