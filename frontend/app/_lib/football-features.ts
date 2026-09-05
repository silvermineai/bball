import { evaluate, type EvaluationGame } from "./evaluation";
export type FeatureMethod = "weekly" | "control" | "efficiency";
export type FeatureGame = Omit<EvaluationGame, "preseason"> & {
  control: EvaluationGame["weekly"];
  efficiency: EvaluationGame["weekly"];
  feature_state_id: string;
  features: number[];
  missing_history: string[];
  contributions: Record<
    "control" | "efficiency",
    { intercept: number; features: number[]; correction: number }
  >;
};
export type FeatureSummary = {
  id: string;
  generated_at: string;
  base_experiment_id: string;
  coverage: {
    training_games: number;
    calibration_games: number;
    evaluation_games: number;
    paired_advanced_games: number;
    feature_states: number;
    missing_history_games: number;
  };
  cohort: { compared_games: number; outside_field: number };
  paired_difference: {
    difference: number;
    low: number;
    high: number;
    weeks: number;
  };
  metrics: Record<FeatureMethod, ReturnType<typeof evaluate>>;
  models: Record<
    "control" | "efficiency",
    {
      features: string[];
      coefficients: number[];
      mean: number[];
      scale: number[];
      training_ids: string[];
      penalty: number;
    }
  >;
  sources: {
    dataset: string;
    season: number;
    url: string;
    fetched_at: string;
    sha256: string;
  }[];
  spec: {
    recorded_at: string;
    training_season: number;
    calibration_season: number;
    evaluation_season: number;
    ridge_penalty: number;
    shrinkage_plays: number;
    prior_season_weight: number;
  };
};
export const featureLabels = [
  "Weekly score margin",
  "Offensive EPA / play gap",
  "EPA / play allowed gap",
  "Offensive yards / play gap",
  "Yards / play allowed gap",
];
export const methodLabels: Record<FeatureMethod, string> = {
  weekly: "Original weekly model",
  control: "Score-only correction",
  efficiency: "Score + efficiency",
};
export function featureMetrics(rows: FeatureGame[], method: FeatureMethod) {
  return evaluate(
    rows.map((r) => ({ ...r, preseason: r[method] })),
    "preseason",
  );
}
export function featureRows(
  rows: FeatureGame[],
  q: string,
  month: string,
  minimum: number,
) {
  return rows.filter(
    (r) =>
      (!month || r.starts_at.slice(0, 7) === month) &&
      (r.home_name + " " + r.away_name)
        .toLowerCase()
        .includes(q.trim().toLowerCase()) &&
      Math.abs(r.efficiency.home_margin - r.control.home_margin) >= minimum,
  );
}
export function featureCsv(rows: FeatureGame[]) {
  const header = [
    "game_id",
    "kickoff",
    "home",
    "away",
    "actual_home_margin",
    ...Object.keys(methodLabels).flatMap((m) => [
      m + "_margin",
      m + "_home_probability",
    ]),
    "feature_cutoff",
    "feature_state_id",
    ...featureLabels,
  ];
  const records = rows.map((r) => [
    r.id,
    r.starts_at,
    r.home_name,
    r.away_name,
    r.home_score - r.away_score,
    ...(Object.keys(methodLabels) as FeatureMethod[]).flatMap((m) => [
      r[m].home_margin,
      r[m].home_win_probability,
    ]),
    r.training_before,
    r.feature_state_id,
    ...r.features,
  ]);
  const cell = (v: unknown) =>
    '"' +
    String(
      typeof v === "string" && /^[\s]*[=+\-@]/.test(v) ? "'" + v : (v ?? ""),
    ).replaceAll('"', '""') +
    '"';
  return (
    [header, ...records].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n"
  );
}
