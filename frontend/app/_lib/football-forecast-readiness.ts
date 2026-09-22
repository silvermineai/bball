import type { Game } from "./data";
import { validFootballPredictionArithmetic } from "./football-prediction-integrity";

export type FootballForecastDivision = "d1" | "d2" | "d3";

export type FootballForecastReadinessRow = {
  division: FootballForecastDivision;
  scheduled: number;
  forecasted: number;
  missing_forecast: number;
  unlabeled_forecast: number;
  market_linked: number;
};

export type FootballForecastReadiness = {
  rows: FootballForecastReadinessRow[];
  mixed_division_games: number;
  invalid_forecasts: number;
  total_scheduled: number;
  total_forecasted: number;
};

const DIVISIONS: FootballForecastDivision[] = ["d1", "d2", "d3"];

function division(value: unknown): FootballForecastDivision | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized === "fbs" || normalized === "fcs" || normalized === "d1" || normalized === "division1" || normalized === "divisioni") return "d1";
  if (normalized === "d2" || normalized === "division2" || normalized === "divisionii") return "d2";
  if (normalized === "d3" || normalized === "division3" || normalized === "divisioniii") return "d3";
  return null;
}

function validForecast(value: Game["prediction"]): boolean {
  if (!value) return false;
  if (!validFootballPredictionArithmetic(value)) return false;
  const numbers = [value.home_margin, value.total, value.home_win_probability, value.margin_low, value.margin_high];
  return numbers.every((item) => typeof item === "number" && Number.isFinite(item))
    && value.home_win_probability >= 0
    && value.home_win_probability <= 1
    && value.total >= 0
    && value.margin_low <= value.home_margin
    && value.margin_high >= value.home_margin;
}

/**
 * Build the upcoming slate's evidence ledger without treating a missing or
 * malformed prediction as a zero. A game is assigned to a division only when
 * both source labels resolve to the same NCAA level; mixed or unknown pairs
 * stay visible in the explicit mixed count.
 */
export function footballForecastReadiness(
  games: Game[],
  marketLinkedGameIds: ReadonlySet<string> = new Set(),
): FootballForecastReadiness {
  const rows = DIVISIONS.map((divisionName) => ({
    division: divisionName,
    scheduled: 0,
    forecasted: 0,
    missing_forecast: 0,
    unlabeled_forecast: 0,
    market_linked: 0,
  }));
  const byDivision = new Map(rows.map((row) => [row.division, row]));
  let mixedDivisionGames = 0;
  let invalidForecasts = 0;
  let totalForecasted = 0;

  for (const game of games) {
    const homeDivision = division(game.home_division);
    const awayDivision = division(game.away_division);
    const scope = homeDivision && homeDivision === awayDivision ? byDivision.get(homeDivision) : undefined;
    if (!scope) {
      mixedDivisionGames += 1;
      continue;
    }
    scope.scheduled += 1;
    if (!game.prediction) {
      scope.missing_forecast += 1;
      continue;
    }
    if (!validForecast(game.prediction)) {
      invalidForecasts += 1;
      scope.missing_forecast += 1;
      continue;
    }
    scope.forecasted += 1;
    totalForecasted += 1;
    if (typeof game.prediction.model_id !== "string" || !game.prediction.model_id.trim()) scope.unlabeled_forecast += 1;
    if (marketLinkedGameIds.has(game.id)) scope.market_linked += 1;
  }

  return {
    rows,
    mixed_division_games: mixedDivisionGames,
    invalid_forecasts: invalidForecasts,
    total_scheduled: rows.reduce((sum, row) => sum + row.scheduled, 0),
    total_forecasted: totalForecasted,
  };
}
