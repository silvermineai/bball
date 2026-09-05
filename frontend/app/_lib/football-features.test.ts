import fs from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  featureCsv,
  featureMetrics,
  featureRows,
  type FeatureGame,
  type FeatureMethod,
  type FeatureSummary,
} from "./football-features";
const root = "public/data/football/features/";
const read = (name: string) => JSON.parse(fs.readFileSync(root + name, "utf8"));
const summary: FeatureSummary = read("summary.json");
const games: FeatureGame[] = read("games.json").games;
describe("football efficiency experiment", () => {
  it("reproduces all metrics on the unchanged weekly cohort", () => {
    const old = JSON.parse(
      fs.readFileSync("public/data/football/evaluation/games.json", "utf8"),
    );
    expect(games.map((g) => g.id).sort()).toEqual(
      old.games.map((g: FeatureGame) => g.id).sort(),
    );
    for (const method of [
      "weekly",
      "control",
      "efficiency",
    ] as FeatureMethod[]) {
      const result = featureMetrics(games, method);
      for (const [key, v] of Object.entries(result))
        expect(v).toBeCloseTo(
          summary.metrics[method][key as keyof typeof result]!,
          10,
        );
    }
    const delta =
      featureMetrics(games, "efficiency").margin_mae! -
      featureMetrics(games, "control").margin_mae!;
    expect(delta).toBeCloseTo(summary.paired_difference.difference, 10);
    expect(Number.isFinite(summary.paired_difference.low)).toBe(true);
    expect(summary.paired_difference.low).toBeLessThanOrEqual(
      summary.paired_difference.high,
    );
  });
  it("reproduces contributions and excludes contemporaneous feature inputs", () => {
    const states = new Map(
      read("feature-states.json").states.map((s: { id: string }) => [s.id, s]),
    );
    const inputs = new Map(
      read("advanced-inputs.json").games.map((g: { game_id: string }) => [
        g.game_id,
        g,
      ]),
    );
    for (const item of states.values()) {
      const s = item as {
        training_before: string;
        season: number;
        game_ids: string[];
      };
      for (const id of s.game_ids) {
        const g = inputs.get(id) as { kickoff: string; season: number };
        expect(new Date(g.kickoff).getTime()).toBeLessThan(
          new Date(s.training_before).getTime(),
        );
        expect(g.season).toBeGreaterThanOrEqual(s.season - 1);
        expect(g.season).toBeLessThanOrEqual(s.season);
      }
    }
    for (const g of games) {
      expect(states.has(g.feature_state_id)).toBe(true);
      for (const m of ["control", "efficiency"] as const) {
        const model = summary.models[m];
        const x = m === "control" ? [g.features[0]] : g.features;
        const parts = x.map(
          (v, i) =>
            ((v - model.mean[i]) / model.scale[i]) * model.coefficients[i + 1],
        );
        expect(g[m].home_margin).toBeCloseTo(
          g.weekly.home_margin +
            model.coefficients[0] +
            parts.reduce((a, b) => a + b, 0),
          10,
        );
        parts.forEach((v, i) =>
          expect(v).toBeCloseTo(g.contributions[m].features[i], 10),
        );
      }
    }
  });
  it("shares filtering, exports exact selected values and retains empty states", () => {
    const selected = featureRows(games, "Texas", "2025-10", 1);
    expect(selected.length).toBeGreaterThan(0);
    expect(
      selected.every(
        (g) =>
          (g.home_name + g.away_name).includes("Texas") &&
          g.starts_at.startsWith("2025-10") &&
          Math.abs(g.efficiency.home_margin - g.control.home_margin) >= 1,
      ),
    ).toBe(true);
    expect(featureCsv(selected).split("\r\n").length).toBe(selected.length + 2);
    expect(featureCsv(selected)).toContain(
      String(selected[0].efficiency.home_margin),
    );
    expect(featureMetrics([], "efficiency").margin_mae).toBeNull();
    const unsafe = { ...selected[0], home_name: '=FORMULA("test")' };
    expect(featureCsv([unsafe])).toContain('"\'=FORMULA(""test"")"');
  });
  it("verifies the complete artifact manifest and common edition", () => {
    const m = read("manifest.json");
    expect(m.experiment_id).toBe(summary.id);
    for (const [name, hash] of Object.entries(m.files)) {
      expect(
        createHash("sha256")
          .update(fs.readFileSync(root + name))
          .digest("hex"),
      ).toBe(hash);
      const value = read(name);
      expect(value.experiment_id || value.id).toBe(summary.id);
    }
  });
});
