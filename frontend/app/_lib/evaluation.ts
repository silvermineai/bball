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
  /** Coverage of the independent total range, when the edition publishes one. */
  total_interval_coverage?: number | null;
  total_interval_games?: number;
  margin_bias: number | null;
};
export type ConfidenceMetrics = EvaluationMetrics & {
  label: string;
  minimum: number;
  maximum: number;
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
  confidence_metrics?: Record<
    Method,
    Array<
      EvaluationMetrics & {
        label: string;
        minimum: number;
        maximum: number;
      }
    >
  >;
  season_results?: {
    season: number;
    calibration_season: number;
    stage: string;
    metrics: Record<Method, EvaluationMetrics>;
    compared_games: number;
    weekly_fits: number;
    calibration_games?: number;
    calibration_weeks?: number;
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

export type EvaluationHighlight = {
  game: EvaluationGame;
  error: number;
  absoluteError: number;
  improvement: number;
  outsideRange: boolean;
};

/**
 * Select review-first games without changing any evaluation metric. A
 * positive error means the selected model overestimated the home margin;
 * negative means it underestimated it.
 */
export function evaluationHighlights(rows: EvaluationGame[], method: Method = "weekly") {
  const highlighted: EvaluationHighlight[] = rows.map((game) => {
    const actual = game.home_score - game.away_score;
    const error = game[method].home_margin - actual;
    const preseasonError = game.preseason.home_margin - actual;
    return {
      game,
      error,
      absoluteError: Math.abs(error),
      improvement: Math.abs(preseasonError) - Math.abs(error),
      outsideRange: actual < game[method].margin_low || actual > game[method].margin_high,
    };
  });
  const misses = [...highlighted]
    .sort((a, b) => b.absoluteError - a.absoluteError || a.game.starts_at.localeCompare(b.game.starts_at) || a.game.id.localeCompare(b.game.id))
    .slice(0, 3);
  const improvements = highlighted
    .filter((row) => row.improvement > 0)
    .sort((a, b) => b.improvement - a.improvement || a.game.starts_at.localeCompare(b.game.starts_at) || a.game.id.localeCompare(b.game.id))
    .slice(0, 3);
  return { misses, improvements };
}

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
      total_interval_coverage: null,
      total_interval_games: 0,
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
  let totalIntervalGames = 0;
  let totalIntervalCovered = 0;
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
    if (
      Number.isFinite(p.total_low)
      && Number.isFinite(p.total_high)
      && Number.isFinite(p.total_half_width)
      && Number.isFinite(p.total)
      && (p.total_half_width ?? 0) > 0
      && (p.total_low ?? Number.POSITIVE_INFINITY) <= (p.total ?? Number.NEGATIVE_INFINITY)
      && (p.total ?? Number.POSITIVE_INFINITY) <= (p.total_high ?? Number.NEGATIVE_INFINITY)
      && Math.abs((p.total! - p.total_low!) - p.total_half_width!) <= 0.1
      && Math.abs((p.total_high! - p.total!) - p.total_half_width!) <= 0.1
    ) {
      totalIntervalGames += 1;
      totalIntervalCovered += +((p.total_low ?? 0) <= row.home_score + row.away_score && row.home_score + row.away_score <= (p.total_high ?? 0));
    }
  }
  const n = rows.length;
  const result: EvaluationMetrics = {
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
  if (totalIntervalGames > 0) {
    result.total_interval_coverage = totalIntervalCovered / totalIntervalGames;
    result.total_interval_games = totalIntervalGames;
  }
  return result;
}

const confidenceBands = [
  { label: "50–59%", minimum: 0.5, maximum: 0.6 },
  { label: "60–69%", minimum: 0.6, maximum: 0.7 },
  { label: "70–79%", minimum: 0.7, maximum: 0.8 },
  { label: "80–89%", minimum: 0.8, maximum: 0.9 },
  { label: "90–100%", minimum: 0.9, maximum: 1.01 },
] as const;

/**
 * Evaluate fixed confidence bands on held-out rows. The band is selected from
 * the probability attached to each prediction and never from its result.
 */
export function confidenceMetrics(
  rows: EvaluationGame[],
  method: Method,
): ConfidenceMetrics[] {
  return confidenceBands.map((band) => {
    const selected = rows.filter((row) => {
      const probability = row[method].home_win_probability;
      if (!Number.isFinite(probability)) return false;
      const confidence = Math.max(probability, 1 - probability);
      return confidence >= band.minimum && confidence < band.maximum;
    });
    return {
      label: band.label,
      minimum: band.minimum,
      maximum: band.maximum,
      ...evaluate(selected, method),
    };
  });
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
