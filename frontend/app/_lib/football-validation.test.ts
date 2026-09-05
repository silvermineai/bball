import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Forecast, Overview } from "./data";

type Row = {
  game: {
    id: string;
    season: number;
    kickoff: string;
    home_id: string;
    away_id: string;
    neutral: number;
    home_score: number;
    away_score: number;
  };
  raw_margin: number;
  raw_total: number;
  prediction: Forecast;
};
type Coefficients = {
  teams: string[];
  margin_coef: number[];
  total_coef: number[];
};
const load = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../public/data/football/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const overview: Overview = load("overview");
const evidence: {
  model_id: string;
  initial_training_ids: string[];
  evaluation_training_ids: string[];
  initial_model: Coefficients;
  evaluation_model: Coefficients;
  calibration_predictions: Row[];
  evaluation_predictions: Row[];
  excluded_calibration_ids: string[];
  excluded_evaluation_ids: string[];
  calibration: Overview["model"]["calibration"];
  evaluation: Overview["model"]["evaluation"];
} = load("validation");
const mean = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;

describe("football published calibration evidence", () => {
  it("separates training, calibration and evaluation cohorts", () => {
    expect(evidence.model_id).toBe(overview.model.id);
    expect(evidence.calibration).toEqual(overview.model.calibration);
    expect(evidence.evaluation).toEqual(overview.model.evaluation);
    for (const [rows, training, exclusions, season, count] of [
      [
        evidence.calibration_predictions,
        evidence.initial_training_ids,
        evidence.excluded_calibration_ids,
        evidence.calibration.season,
        evidence.calibration.games,
      ],
      [
        evidence.evaluation_predictions,
        evidence.evaluation_training_ids,
        evidence.excluded_evaluation_ids,
        evidence.evaluation.season,
        evidence.evaluation.games,
      ],
    ] as const) {
      expect(rows).toHaveLength(count);
      const ids = rows.map((r) => r.game.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(
        ids.some((id) => training.includes(id) || exclusions.includes(id)),
      ).toBe(false);
      expect(rows.every((r) => r.game.season === season)).toBe(true);
    }
    expect(
      Math.max(
        ...evidence.calibration_predictions.map((r) =>
          Date.parse(r.game.kickoff),
        ),
      ),
    ).toBeLessThan(
      Math.min(
        ...evidence.evaluation_predictions.map((r) =>
          Date.parse(r.game.kickoff),
        ),
      ),
    );
  });

  it("reproduces all raw forecasts and the frozen probability/range mapping", () => {
    for (const [rows, model] of [
      [evidence.calibration_predictions, evidence.initial_model],
      [evidence.evaluation_predictions, evidence.evaluation_model],
    ] as const) {
      for (const r of rows) {
        const h = model.teams.indexOf(r.game.home_id) + 2;
        const a = model.teams.indexOf(r.game.away_id) + 2;
        const v = r.game.neutral ? 0 : 1;
        expect(h).toBeGreaterThan(1);
        expect(a).toBeGreaterThan(1);
        const m = model.margin_coef,
          t = model.total_coef;
        expect(r.raw_margin).toBeCloseTo(m[0] + v * m[1] + m[h] - m[a], 10);
        expect(r.raw_total).toBeCloseTo(t[0] + v * t[1] + t[h] + t[a], 10);
      }
    }
    const errors = evidence.calibration_predictions
      .map((r) =>
        Math.abs(r.raw_margin - r.game.home_score + r.game.away_score),
      )
      .sort((a, b) => a - b);
    const position = 0.8 * (errors.length - 1),
      lower = Math.floor(position);
    const width =
      errors[lower] + (position - lower) * (errors[lower + 1] - errors[lower]);
    expect(width).toBeCloseTo(evidence.calibration.margin_half_width, 10);
    const [intercept, slope] = evidence.calibration.logistic_coefficients;
    for (const r of evidence.evaluation_predictions) {
      const p =
        1 /
        (1 +
          Math.exp(
            -Math.max(-30, Math.min(30, intercept + slope * r.raw_margin)),
          ));
      expect(
        Math.abs(p - r.prediction.home_win_probability),
      ).toBeLessThanOrEqual(0.00005000001);
      expect(
        Math.abs(r.raw_margin - width - r.prediction.margin_low),
      ).toBeLessThanOrEqual(0.050000001);
      expect(
        Math.abs(r.raw_margin + width - r.prediction.margin_high),
      ).toBeLessThanOrEqual(0.050000001);
    }
  });

  it("recomputes reported error, probability, reliability and coverage metrics", () => {
    const all = evidence.evaluation_predictions;
    const binary = all.filter((r) => r.game.home_score !== r.game.away_score);
    const e = evidence.evaluation;
    expect(binary).toHaveLength(e.binary_games);
    const outcome = (r: Row) => Number(r.game.home_score > r.game.away_score);
    const probability = (r: Row) =>
      Math.min(1 - 1e-6, Math.max(1e-6, r.prediction.home_win_probability));
    expect(
      mean(
        all.map((r) =>
          Math.abs(r.raw_margin - r.game.home_score + r.game.away_score),
        ),
      ),
    ).toBeCloseTo(e.margin_mae, 10);
    expect(
      Math.sqrt(
        mean(
          all.map(
            (r) => (r.raw_margin - r.game.home_score + r.game.away_score) ** 2,
          ),
        ),
      ),
    ).toBeCloseTo(e.margin_rmse, 10);
    expect(
      mean(
        all.map((r) =>
          Math.abs(r.raw_total - r.game.home_score - r.game.away_score),
        ),
      ),
    ).toBeCloseTo(e.total_mae, 10);
    expect(
      mean(binary.map((r) => (probability(r) - outcome(r)) ** 2)),
    ).toBeCloseTo(e.brier, 10);
    expect(
      mean(
        binary.map(
          (r) =>
            -outcome(r) * Math.log(probability(r)) -
            (1 - outcome(r)) * Math.log(1 - probability(r)),
        ),
      ),
    ).toBeCloseTo(e.log_loss, 10);
    expect(
      mean(
        binary.map((r) => Number(Number(probability(r) >= 0.5) === outcome(r))),
      ),
    ).toBeCloseTo(e.winner_accuracy, 10);
    expect(
      mean(all.map((r) => Number(Number(r.raw_margin > 0) === outcome(r)))),
    ).toBeCloseTo(e.margin_pick_accuracy, 10);
    expect(
      mean(
        all.map((r) =>
          Number(
            r.prediction.margin_low <= r.game.home_score - r.game.away_score &&
              r.game.home_score - r.game.away_score <= r.prediction.margin_high,
          ),
        ),
      ),
    ).toBeCloseTo(e.interval_coverage, 10);
    let count = 0;
    e.reliability.forEach((b, i) => {
      const sample = binary.filter(
        (r) =>
          Math.min(9, Math.floor(r.prediction.home_win_probability * 10)) === i,
      );
      expect(sample).toHaveLength(b.games);
      count += sample.length;
      if (!sample.length) {
        expect(b.predicted).toBeNull();
        expect(b.observed).toBeNull();
      } else {
        expect(
          mean(sample.map((r) => r.prediction.home_win_probability)),
        ).toBeCloseTo(b.predicted!, 10);
        expect(mean(sample.map(outcome))).toBeCloseTo(b.observed!, 10);
      }
    });
    expect(count).toBe(e.binary_games);
  });
});
