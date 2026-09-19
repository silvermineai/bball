import { describe, expect, it } from "vitest";
import { modelReliabilityScope, type SportSummary } from "./research-types";

const summary = (overrides: Partial<SportSummary> = {}): SportSummary => ({
  games: 3,
  registered_versions: 3,
  status_counts: {},
  exclusion_counts: {},
  metrics: {
    games: 2,
    binary_games: 2,
    margin_mae: 10,
    total_mae: 10,
    winner_accuracy: 0.75,
    winner_picks: 2,
    brier: 0.2,
    log_loss: 0.5,
    interval_games: 2,
    interval_coverage: 0.5,
  },
  games_with_comparisons: 0,
  market_metrics: [],
  ...overrides,
});

describe("model reliability scope", () => {
  it("selects the newest edition and keeps older settled results separate", () => {
    const scope = modelReliabilityScope(summary({
      model_metrics: [
        { model_id: "older", first_registered_at: "2026-09-01T00:00:00Z", last_registered_at: "2026-09-01T00:00:00Z", selected_forecasts: 10, eligible_forecasts: 10, settled_games: 2, margin_mae: 10, total_mae: 10, winner_accuracy: 0.75, winner_picks: 2, brier: 0.2, log_loss: 0.5, interval_games: 2, interval_coverage: 0.5 },
        { model_id: "current", first_registered_at: "2026-09-19T00:00:00Z", last_registered_at: "2026-09-19T00:00:00Z", selected_forecasts: 10, eligible_forecasts: 0, settled_games: 0, margin_mae: null, total_mae: null, winner_accuracy: null, winner_picks: 0, brier: null, log_loss: null, interval_games: 0, interval_coverage: null },
      ],
    }));
    expect(scope).toMatchObject({ current: { model_id: "current", settled_games: 0 }, editionCount: 2, aggregateSettled: 2, priorSettled: 2 });
  });

  it("returns an empty edition scope when no edition records exist", () => {
    expect(modelReliabilityScope(summary())).toEqual({ current: null, editionCount: 0, aggregateSettled: 2, priorSettled: 2 });
  });
});
