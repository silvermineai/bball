import { describe, expect, it } from "vitest";
import { formatFootballForecastCoverage } from "./LiveFootballForecastStatus";

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
});
