import { describe, expect, it } from "vitest";
import { parseFootballModelSummary } from "../src/football-forecasts";

describe("football model evidence", () => {
  it("publishes bounded calibration and holdout metrics without fitted coefficients", () => {
    const summary = parseFootballModelSummary(JSON.stringify({
      version: "ridge-team-calibrated-v2",
      target_season: 2026,
      training_games: 3227,
      training_seasons: [2022, 2023, 2024, 2025, 2026],
      latest_training_kickoff: "2026-09-12T00:00:00Z",
      margin_coef: [1, 2, 3],
      calibration: {
        season: 2024,
        games: 787,
        binary_games: 787,
        unscored_games: 11,
        margin_half_width: 23.76,
        logistic_coefficients: [0.1, 0.2],
      },
      evaluation: {
        season: 2025,
        games: 784,
        binary_games: 784,
        unscored_games: 24,
        margin_mae: 14.24,
        margin_rmse: 17.99,
        total_mae: 12.98,
        baseline_margin_mae: 15.99,
        winner_accuracy: 0.654,
        margin_pick_accuracy: 0.662,
        brier: 0.211,
        log_loss: 0.61,
        interval_coverage: 0.806,
        reliability: [
          { lower: 0.6, upper: 0.7, games: 193, predicted: 0.648, observed: 0.71 },
        ],
      },
    }), "2026-09-12T13:30:00Z");

    expect(summary).toMatchObject({
      version: "ridge-team-calibrated-v2",
      target_season: 2026,
      training_games: 3227,
      training_seasons: [2022, 2023, 2024, 2025, 2026],
      cutoff: "2026-09-12T13:30:00Z",
      calibration: { season: 2024, games: 787, margin_half_width: 23.76 },
      evaluation: {
        season: 2025,
        games: 784,
        winner_accuracy: 0.654,
        interval_coverage: 0.806,
        reliability: [{ lower: 0.6, upper: 0.7, games: 193, predicted: 0.648, observed: 0.71 }],
      },
    });
    expect(summary).not.toHaveProperty("margin_coef");
    expect(summary.calibration).not.toHaveProperty("logistic_coefficients");
  });

  it("withholds malformed quality fields and bounds reliability rows", () => {
    const summary = parseFootballModelSummary({
      target_season: "2026",
      training_games: -1,
      training_seasons: [2026, 1800, "2025"],
      calibration: { games: 1.5, margin_half_width: -2 },
      evaluation: {
        winner_accuracy: 1.2,
        brier: -0.1,
        reliability: [
          { lower: 0.8, upper: 0.2, games: 1, predicted: 0.8, observed: 0.7 },
          { lower: 0.4, upper: 0.5, games: 2, predicted: 0.5, observed: null },
        ],
      },
    });

    expect(summary.target_season).toBeNull();
    expect(summary.training_games).toBeNull();
    expect(summary.training_seasons).toEqual([2026]);
    expect(summary.calibration).toMatchObject({ games: null, margin_half_width: null });
    expect(summary.evaluation).toMatchObject({ winner_accuracy: null, brier: null });
    expect(summary.evaluation?.reliability).toEqual([
      { lower: 0.4, upper: 0.5, games: 2, predicted: 0.5, observed: null },
    ]);
  });

  it("returns a safe empty summary for invalid JSON", () => {
    expect(parseFootballModelSummary("not-json", "2026-09-12T00:00:00Z")).toEqual({
      version: null,
      target_season: null,
      training_games: null,
      training_seasons: [],
      latest_training_kickoff: null,
      cutoff: "2026-09-12T00:00:00Z",
      calibration: null,
      evaluation: null,
    });
  });
});
