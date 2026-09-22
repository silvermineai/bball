import { describe, expect, it } from "vitest";
import { footballChallengerStability } from "./football-challenger";

describe("footballChallengerStability", () => {
  it("summarizes finite rolling lifts without treating missing values as zero", () => {
    expect(footballChallengerStability([
      { test_season: 2023, training_seasons: [2022], training_rows: 10, rows: 20, baseline_mae: 14, challenger_mae: 13.8, improvement_vs_primary: 0.2, baseline_rmse: 17, challenger_rmse: 16 },
      { test_season: 2024, training_seasons: [2022, 2023], training_rows: 30, rows: 20, baseline_mae: 14, challenger_mae: 14.1, improvement_vs_primary: -0.1, baseline_rmse: 17, challenger_rmse: 17.1 },
      { test_season: 2025, training_seasons: [2022, 2023, 2024], training_rows: 50, rows: 20, baseline_mae: 14, challenger_mae: 14, improvement_vs_primary: null, baseline_rmse: 17, challenger_rmse: 17 },
    ])).toMatchObject({ transitions: 2, positive_lift: 1, negative_lift: 1, mean_improvement: 0.05, median_improvement: 0.05, minimum_improvement: -0.1, maximum_improvement: 0.2, positive_share: 0.5 });
  });

  it("returns unavailable summary when no transition lift is published", () => {
    expect(footballChallengerStability([])).toEqual({ transitions: 0, positive_lift: 0, negative_lift: 0, mean_improvement: null, median_improvement: null, minimum_improvement: null, maximum_improvement: null, positive_share: null });
  });
});
