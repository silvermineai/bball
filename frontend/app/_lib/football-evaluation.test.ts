import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { evaluate, type EvaluationGame, type Method } from "./evaluation";
import type { FootballEvaluationSummary } from "./football-evaluation";
const base = new URL("../../public/data/football/evaluation/", import.meta.url);
const read = (name: string) =>
  JSON.parse(readFileSync(new URL(name, base), "utf8"));
const summary = read("summary.json") as FootballEvaluationSummary;
const games = read("games.json").games as EvaluationGame[];
type Input = {
  id: string;
  season: number;
  kickoff: string;
  home_id: string;
  away_id: string;
  home_score: number;
  away_score: number;
  neutral: number;
};
type Model = { teams: string[]; margin_coef: number[]; total_coef: number[] };
type Fit = {
  id: string;
  season: number;
  week_start: string;
  training_before: string;
  training_ids: string[];
  model: Model;
};
const fits = read("fits.json") as {
  initial_model: Model;
  preseason_model: Model;
  fits: Fit[];
};
const inputs = read("training-games.json").games as Input[];
const byFit = new Map(fits.fits.map((f) => [f.id, f]));
function prediction(
  model: Model,
  g: { home_id: string; away_id: string; neutral: number },
) {
  const h = model.teams.indexOf(g.home_id) + 2,
    a = model.teams.indexOf(g.away_id) + 2,
    v = g.neutral ? 0 : 1;
  expect(h).toBeGreaterThan(1);
  expect(a).toBeGreaterThan(1);
  return {
    margin:
      model.margin_coef[0] +
      v * model.margin_coef[1] +
      model.margin_coef[h] -
      model.margin_coef[a],
    total:
      model.total_coef[0] +
      v * model.total_coef[1] +
      model.total_coef[h] +
      model.total_coef[a],
  };
}
describe("football weekly experiment evidence", () => {
  it("reproduces both methods and the unchanged published holdout", () => {
    const live = JSON.parse(
      readFileSync(
        new URL("../../public/data/football/overview.json", import.meta.url),
        "utf8",
      ),
    );
    expect(summary.production_model_id).toBe(live.model.id);
    for (const method of ["preseason", "weekly"] as Method[]) {
      const calculated = evaluate(games, method);
      for (const key of Object.keys(calculated) as (keyof typeof calculated)[])
        expect(calculated[key]).toBeCloseTo(summary.metrics[method][key]!, 10);
    }
    for (const key of [
      "games",
      "margin_mae",
      "margin_rmse",
      "total_mae",
      "winner_accuracy",
      "brier",
      "log_loss",
      "interval_coverage",
    ] as const)
      expect(summary.metrics.preseason[key]).toBeCloseTo(
        live.model.evaluation[key],
        10,
      );
    const validation = JSON.parse(
      readFileSync(
        new URL("../../public/data/football/validation.json", import.meta.url),
        "utf8",
      ),
    );
    expect(games.map((g) => g.id).sort()).toEqual(
      validation.evaluation_predictions
        .map((r: { game: Input }) => r.game.id)
        .sort(),
    );
  });
  it("reproduces every score from coefficients and verifies every training cutoff", () => {
    for (const f of fits.fits) {
      const base =
        f.season === 2024 ? fits.initial_model : fits.preseason_model;
      expect(f.model.teams).toEqual(base.teams);
      const expected = inputs
        .filter(
          (g) =>
            g.season <= f.season &&
            Date.parse(g.kickoff) < Date.parse(f.training_before) &&
            base.teams.includes(g.home_id) &&
            base.teams.includes(g.away_id),
        )
        .map((g) => g.id)
        .sort();
      expect(f.training_ids).toEqual(expected);
      expect(Date.parse(f.week_start) - Date.parse(f.training_before)).toBe(
        86400000,
      );
    }
    for (const g of games) {
      const f = byFit.get(g.weekly_fit_id)!;
      expect(f.training_ids).not.toContain(g.id);
      expect(Date.parse(f.week_start)).toBeLessThanOrEqual(
        Date.parse(g.starts_at),
      );
      for (const method of ["preseason", "weekly"] as Method[]) {
        const raw = prediction(
          method === "weekly" ? f.model : fits.preseason_model,
          g,
        );
        expect(raw.margin).toBeCloseTo(g[method].home_margin, 10);
        expect(raw.total).toBeCloseTo(g[method].total, 10);
        const [intercept, slope] =
          summary.calibration[method].logistic_coefficients;
        expect(g[method].home_win_probability).toBeCloseTo(
          1 /
            (1 +
              Math.exp(
                -Math.max(-30, Math.min(30, intercept + slope * raw.margin)),
              )),
          4,
        );
        expect(g[method].margin_low).toBeCloseTo(
          raw.margin - summary.calibration[method].margin_half_width,
          1,
        );
        expect(g[method].margin_high).toBeCloseTo(
          raw.margin + summary.calibration[method].margin_half_width,
          1,
        );
      }
    }
    for (const r of read("calibration-games.json").games) {
      const raw = prediction(byFit.get(r.weekly_fit_id)!.model, r.game);
      expect(raw.margin).toBeCloseTo(r.raw_margin, 10);
      expect(raw.total).toBeCloseTo(r.raw_total, 10);
      expect(r.game.season).toBe(2024);
    }
  });
  it("keeps all downloads in one content-verified experiment", () => {
    const manifest = read("manifest.json");
    expect(manifest.signature).toBe(summary.id);
    for (const [name, hash] of Object.entries(manifest.files)) {
      expect(
        createHash("sha256")
          .update(readFileSync(new URL(name, base)))
          .digest("hex"),
      ).toBe(hash);
      const value = read(name);
      expect(value.experiment_id || value.id).toBe(summary.id);
    }
  });
});
