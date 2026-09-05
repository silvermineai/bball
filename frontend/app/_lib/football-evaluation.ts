import type { EvaluationSummary } from "./evaluation";
export type FootballEvaluationSummary = Omit<EvaluationSummary, "coverage"> & {
  coverage: Omit<EvaluationSummary["coverage"], "paired_box_games"> & {
    scored_fbs_games: number;
  };
};
