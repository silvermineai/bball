export type ScenarioModel = {
  id: string;
  cutoff: string;
  teams: string[];
  efficiency: number[];
  tempo: number[];
  calibration: { logistic_coefficients: number[]; margin_half_width: number };
};
/** Same published coefficients/calibration as Python; hypothetical scenarios are not ledger registrations. */
export function basketballScenario(
  model: ScenarioModel,
  homeId: string,
  awayId: string,
  neutral: boolean,
) {
  const h = model.teams.indexOf(homeId),
    a = model.teams.indexOf(awayId),
    n = model.teams.length;
  if (h < 0 || a < 0 || h === a) return null;
  const b = model.efficiency,
    t = model.tempo,
    v = neutral ? 0 : b[1] / 2;
  const pace = t[0] + t[h + 1] + t[a + 1];
  const home = ((b[0] + b[h + 2] + b[a + n + 2] + v) * pace) / 100;
  const away = ((b[0] + b[a + 2] + b[h + n + 2] - v) * pace) / 100;
  const margin = home - away,
    [intercept, slope] = model.calibration.logistic_coefficients;
  const probability =
    1 /
    (1 + Math.exp(-Math.max(-30, Math.min(30, intercept + slope * margin))));
  return {
    home_score: home,
    away_score: away,
    home_margin: margin,
    total: home + away,
    pace,
    home_win_probability: probability,
    margin_low: margin - model.calibration.margin_half_width,
    margin_high: margin + model.calibration.margin_half_width,
    explanation: {
      home: {
        league: b[0],
        own_offense: b[h + 2],
        opponent_defense: b[a + n + 2],
        venue: v,
        efficiency: (home * 100) / pace,
      },
      away: {
        league: b[0],
        own_offense: b[a + 2],
        opponent_defense: b[h + n + 2],
        venue: -v,
        efficiency: (away * 100) / pace,
      },
    },
  };
}
