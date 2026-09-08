import type { BBPrediction } from "./basketball-types";

export type Method = "preseason" | "weekly";
export type EvaluationGame = {
  id: string;
  season: number;
  starts_at: string;
  home_id: string;
  away_id: string;
  home_name: string;
  away_name: string;
  home_score: number;
  away_score: number;
  neutral: number;
  periods?: number;
  preseason: Omit<BBPrediction, "pace">;
  weekly: Omit<BBPrediction, "pace">;
  weekly_fit_id: string;
  training_before: string;
};
export type EvaluationMetrics = {
  games: number;
  margin_mae: number | null;
  margin_rmse: number | null;
  total_mae: number | null;
  winner_accuracy: number | null;
  brier: number | null;
  log_loss: number | null;
  interval_coverage: number | null;
  margin_bias: number | null;
};
export type EvaluationSummary = {
  id: string;
  generated_at: string;
  production_model_id: string;
  source_edition: string;
  settings: {
    version: string;
    calibration_season: number;
    evaluation_season: number;
    bootstrap_replicates: number;
  };
  metrics: Record<Method, EvaluationMetrics>;
  season_results?: {
    season: number;
    calibration_season: number;
    stage: string;
    metrics: Record<Method, EvaluationMetrics>;
    compared_games: number;
    weekly_fits: number;
  }[];
  calibration: Record<
    Method,
    {
      games: number;
      margin_half_width: number;
      logistic_coefficients: number[];
    }
  >;
  paired_mae_difference: {
    difference: number;
    low: number;
    high: number;
    weeks: number;
  };
  baseline_margin_mae: number;
  coverage: {
    completed_schedule_games: number;
    paired_box_games: number;
    compared_games: number;
    outside_field: number;
    calibration_games: number;
    calibration_weeks: number;
    test_weeks: number;
  };
  limitations: string[];
  sources: {
    dataset: string;
    season: number;
    fetched_at: string;
    url: string;
    sha256: string;
  }[];
};

export function evaluate(
  rows: EvaluationGame[],
  method: Method,
): EvaluationMetrics {
  if (!rows.length)
    return {
      games: 0,
      margin_mae: null,
      margin_rmse: null,
      total_mae: null,
      winner_accuracy: null,
      brier: null,
      log_loss: null,
      interval_coverage: null,
      margin_bias: null,
    };
  let mae = 0,
    mse = 0,
    total = 0,
    wins = 0,
    brier = 0,
    loss = 0,
    covered = 0,
    bias = 0;
  for (const row of rows) {
    const p = row[method],
      actual = row.home_score - row.away_score,
      error = p.home_margin - actual;
    const probability = Math.max(
        1e-6,
        Math.min(1 - 1e-6, p.home_win_probability),
      ),
      outcome = +(actual > 0);
    mae += Math.abs(error);
    mse += error * error;
    bias += error;
    total += Math.abs(p.total - row.home_score - row.away_score);
    wins += +(probability >= 0.5 === (outcome === 1));
    brier += (probability - outcome) ** 2;
    loss -=
      outcome * Math.log(probability) +
      (1 - outcome) * Math.log(1 - probability);
    covered += +(p.margin_low <= actual && actual <= p.margin_high);
  }
  const n = rows.length;
  return {
    games: n,
    margin_mae: mae / n,
    margin_rmse: Math.sqrt(mse / n),
    total_mae: total / n,
    winner_accuracy: wins / n,
    brier: brier / n,
    log_loss: loss / n,
    interval_coverage: covered / n,
    margin_bias: bias / n,
  };
}

export function reliability(rows: EvaluationGame[], method: Method) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    index: i,
    count: 0,
    predicted: 0,
    observed: 0,
  }));
  for (const row of rows) {
    const p = row[method].home_win_probability,
      bin = buckets[Math.min(9, Math.max(0, Math.floor(p * 10)))];
    bin.count++;
    bin.predicted += p;
    bin.observed += +(row.home_score > row.away_score);
  }
  return buckets.map((b) => ({
    ...b,
    predicted: b.count ? b.predicted / b.count : null,
    observed: b.count ? b.observed / b.count : null,
  }));
}

export function filterEvaluation(
  rows: EvaluationGame[],
  month: string,
  venue: string,
  query: string,
) {
  const q = query.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
  return rows.filter(
    (g) =>
      (!month || g.starts_at.slice(0, 7) === month) &&
      (!venue || Boolean(g.neutral) === (venue === "neutral")) &&
      `${g.home_name} ${g.away_name}`
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .includes(q),
  );
}

export function evaluationCsv(rows: EvaluationGame[]) {
  const columns: (string | number)[][] = [
    [
      "game_id",
      "starts_at_utc",
      "away",
      "home",
      "away_final",
      "home_final",
      "neutral",
      "preseason_home_margin",
      "weekly_home_margin",
      "actual_home_margin",
      "preseason_home_probability",
      "weekly_home_probability",
      "preseason_total",
      "weekly_total",
      "weekly_margin_low",
      "weekly_margin_high",
      "weekly_training_before_utc",
      "weekly_fit_id",
    ],
  ];
  rows.forEach((g) =>
    columns.push([
      g.id,
      g.starts_at,
      g.away_name,
      g.home_name,
      g.away_score,
      g.home_score,
      g.neutral,
      g.preseason.home_margin,
      g.weekly.home_margin,
      g.home_score - g.away_score,
      g.preseason.home_win_probability,
      g.weekly.home_win_probability,
      g.preseason.total,
      g.weekly.total,
      g.weekly.margin_low,
      g.weekly.margin_high,
      g.training_before,
      g.weekly_fit_id,
    ]),
  );
  return columns
    .map((row) =>
      row
        .map((value) => {
          const s =
            typeof value === "string" && /^[=+@\-\t\r]/.test(value)
              ? `'${value}`
              : String(value);
          return `"${s.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}
