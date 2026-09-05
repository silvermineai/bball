import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluate,
  evaluationCsv,
  filterEvaluation,
  reliability,
  type EvaluationGame,
  type EvaluationSummary,
  type Method,
} from "./evaluation";
const data = JSON.parse(
  readFileSync(
    new URL(
      "../../public/data/basketball/evaluation/games.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const summary: EvaluationSummary = JSON.parse(
  readFileSync(
    new URL(
      "../../public/data/basketball/evaluation/summary.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const games: EvaluationGame[] = data.games;
describe("same-game model evaluation", () => {
  it("reproduces every Python aggregate from the public predictions", () => {
    expect(data.experiment_id).toBe(summary.id);
    for (const method of ["preseason", "weekly"] as Method[]) {
      const calculated = evaluate(games, method);
      for (const key of Object.keys(
        calculated,
      ) as (keyof typeof calculated)[]) {
        expect(calculated[key]).toBeCloseTo(summary.metrics[method][key]!, 10);
      }
      const bins = reliability(games, method);
      expect(bins.reduce((n, b) => n + b.count, 0)).toBe(games.length);
      const observed = bins.reduce(
        (n, b) => n + (b.observed || 0) * b.count,
        0,
      );
      expect(observed).toBeCloseTo(
        games.filter((g) => g.home_score > g.away_score).length,
        10,
      );
    }
  });
  it("uses the same cohort for both methods and keeps no-match metrics unavailable", () => {
    const selected = filterEvaluation(games, "2026-01", "neutral", "");
    expect(selected.length).toBeGreaterThan(0);
    expect(
      selected.every((g) => g.neutral && g.starts_at.startsWith("2026-01")),
    ).toBe(true);
    expect(evaluate(selected, "weekly").games).toBe(
      evaluate(selected, "preseason").games,
    );
    expect(
      filterEvaluation(games, "", "", "Duke").every((g) =>
        (g.home_name + g.away_name).includes("Duke"),
      ),
    ).toBe(true);
    expect(evaluate([], "weekly").margin_mae).toBeNull();
    expect(
      reliability([], "weekly").every(
        (b) => b.predicted === null && b.observed === null,
      ),
    ).toBe(true);
  });
  it("exports the selected evidence and protects spreadsheet text cells", () => {
    const csv = evaluationCsv([{ ...games[0], home_name: '=bad,"name"' }]);
    expect(csv).toContain('"\'=bad,""name"""');
    expect(csv).toContain(games[0].weekly_fit_id);
    expect(csv).toContain(games[0].training_before);
    expect(csv.split("\r\n")).toHaveLength(2);
  });
});
