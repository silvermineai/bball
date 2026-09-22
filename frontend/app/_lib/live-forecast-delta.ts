export type ForecastDeltaInput = {
  home_margin?: number | null;
  home_win_probability?: number | null;
  total?: number | null;
};

export type ForecastDelta = {
  /** Point change in the projected home margin. */
  homeMargin: number | null;
  /** Change in home win probability, expressed in percentage points. */
  homeWinProbabilityPp: number | null;
  /** Point change in the projected game total. */
  total: number | null;
};

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function validProbability(value: number | null | undefined): value is number {
  return finite(value) && value >= 0 && value <= 1;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * Compare two forecast editions field by field. A malformed or out-of-range
 * field stays unavailable while valid independent fields remain useful.
 * This prevents a partial live response from manufacturing a change value.
 */
export function compareForecastEditions(
  staticPrediction: ForecastDeltaInput | null | undefined,
  livePrediction: ForecastDeltaInput | null | undefined,
): ForecastDelta {
  return {
    homeMargin: staticPrediction && livePrediction && finite(staticPrediction.home_margin) && finite(livePrediction.home_margin)
      ? livePrediction.home_margin - staticPrediction.home_margin
      : null,
    homeWinProbabilityPp: staticPrediction && livePrediction && validProbability(staticPrediction.home_win_probability) && validProbability(livePrediction.home_win_probability)
      ? rounded((livePrediction.home_win_probability - staticPrediction.home_win_probability) * 100)
      : null,
    total: staticPrediction && livePrediction && finite(staticPrediction.total) && finite(livePrediction.total)
      ? livePrediction.total - staticPrediction.total
      : null,
  };
}

export function hasForecastDelta(delta: ForecastDelta): boolean {
  return delta.homeMargin != null || delta.homeWinProbabilityPp != null || delta.total != null;
}
