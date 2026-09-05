import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { basketballScenario, type ScenarioModel } from "./basketball-scenario";
const published = JSON.parse(
  readFileSync(
    new URL("../../public/data/basketball/overview.json", import.meta.url),
    "utf8",
  ),
);
const model: ScenarioModel = published.model;
describe("published basketball scenario parity", () => {
  it("agrees with every Python-generated scheduled forecast, to its published precision", () => {
    let checked = 0;
    for (const game of published.upcoming) {
      if (!game.prediction) continue;
      const result = basketballScenario(
        model,
        game.home_id,
        game.away_id,
        Boolean(game.neutral),
      );
      expect(result).not.toBeNull();
      for (const key of Object.keys(result!) as (keyof NonNullable<
        typeof result
      >)[]) {
        expect(result![key]).toBeCloseTo(
          game.prediction[key],
          key === "home_win_probability" ? 5 : 2,
        );
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });
  it("rejects unknown or identical teams", () => {
    expect(
      basketballScenario(model, "unknown", model.teams[0], true),
    ).toBeNull();
    expect(
      basketballScenario(model, model.teams[0], model.teams[0], true),
    ).toBeNull();
  });
  it("keeps neutral scores symmetric and changes scoring with home court", () => {
    const [a, b] = model.teams;
    const neutral = basketballScenario(model, a, b, true)!,
      reverse = basketballScenario(model, b, a, true)!,
      home = basketballScenario(model, a, b, false)!;
    expect(neutral.home_score).toBeCloseTo(reverse.away_score, 10);
    expect(neutral.away_score).toBeCloseTo(reverse.home_score, 10);
    expect(home.home_score).toBeGreaterThan(neutral.home_score);
    expect(home.away_score).toBeLessThan(neutral.away_score);
    expect(home.pace).toBe(neutral.pace);
  });
});
