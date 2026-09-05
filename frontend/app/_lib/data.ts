import fs from "node:fs";
import path from "node:path";
export type Forecast = {
  home_margin: number;
  total: number;
  home_score: number;
  away_score: number;
  home_win_probability: number;
  margin_low: number;
  margin_high: number;
};
export type Game = {
  id: string;
  season: number;
  kickoff: string;
  home_id: string;
  away_id: string;
  home_name: string;
  away_name: string;
  home_conference: string;
  away_conference: string;
  home_division: string;
  away_division: string;
  week: number;
  neutral: number;
  venue: string;
  time_tbd: number;
  prediction: Forecast | null;
  market: {
    home_spread: number | null;
    total: number | null;
    observed_at: string;
    source: string;
    margin_difference: number | null;
  } | null;
};
export type Overview = {
  generated_at: string;
  season: number;
  coverage: {
    games: number;
    completed_games: number;
    finals_missing_scores: number;
    upcoming_games: number;
    forecast_games: number;
    box_rows: number;
    market_observations: number;
    pregame_market_observations: number;
  };
  model: {
    id: string;
    version: string;
    cutoff: string;
    training_games: number;
    training_seasons: number[];
    calibration: {
      season: number;
      games: number;
      binary_games: number;
      unscored_games: number;
      training_seasons: number[];
      logistic_coefficients: number[];
      margin_half_width: number;
    };
    evaluation: {
      season: number;
      games: number;
      unscored_games: number;
      training_seasons: number[];
      margin_mae: number;
      margin_rmse: number;
      total_mae: number;
      baseline_margin_mae: number;
      winner_accuracy: number;
      margin_pick_accuracy: number;
      binary_games: number;
      brier: number;
      log_loss: number;
      interval_coverage: number;
      reliability: {
        lower: number;
        upper: number;
        games: number;
        predicted: number | null;
        observed: number | null;
      }[];
      design: string;
      probability_note: string;
    };
    limitations: string[];
  };
  ratings: {
    id: string;
    name: string;
    conference: string;
    rating: number;
    rank: number;
  }[];
  upcoming: Game[];
  sources: {
    dataset: string;
    season: number;
    url: string;
    fetched_at: string;
    sha256: string;
    last_modified: string | null;
  }[];
};
export function getOverview(): Overview {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/football/overview.json"),
      "utf8",
    ),
  );
}
