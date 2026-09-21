import { describe, expect, it } from "vitest";
import { formatFootballForecastCoverage, formatFootballModelEvidence } from "./LiveFootballForecastStatus";

describe("football forecast coverage status", () => {
  it("separates intentional field exclusions from eligible model gaps", () => {
    expect(formatFootballForecastCoverage({
      upcoming_games: 699,
      forecast_games: 658,
      outside_fbs_field: 41,
      eligible_missing_prediction: 0,
    })).toBe("658 of 699 upcoming games forecast · 41 outside the trained FBS field · all eligible FBS matchups covered");

    expect(formatFootballForecastCoverage({
      upcoming_games: 700,
      forecast_games: 658,
      outside_fbs_field: 41,
      eligible_missing_prediction: 1,
    })).toContain("1 eligible FBS matchup is missing a registered prediction");
  });

  it("withholds inconsistent or incomplete coverage claims", () => {
    expect(formatFootballForecastCoverage()).toBe("");
    expect(formatFootballForecastCoverage({
      upcoming_games: 699,
      forecast_games: 658,
      outside_fbs_field: 40,
      eligible_missing_prediction: 0,
    })).toBe("");
    expect(formatFootballForecastCoverage({
      upcoming_games: -1,
      forecast_games: 0,
      outside_fbs_field: 0,
      eligible_missing_prediction: 0,
    })).toBe("");
  });

  it("formats held-out model evidence without turning missing metrics into claims", () => {
    expect(formatFootballModelEvidence({
      training_games: 3331,
      evaluation: { games: 784, winner_accuracy: 0.6543, margin_mae: 14.24, brier: 0.211, interval_coverage: 0.806 },
      calibration: { games: 787, margin_half_width: 23.7 },
    })).toBe("held out 784 games · 65.4% winner accuracy · 14.2 pt margin MAE · Brier 0.211 · 80.6% range coverage · calibrated on 787 games");
    expect(formatFootballModelEvidence({ evaluation: { games: 0, winner_accuracy: 0.9 } })).toBe("");
    expect(formatFootballModelEvidence({ evaluation: { games: 12, winner_accuracy: null, margin_mae: null } })).toBe("held out 12 games");
  });
});
