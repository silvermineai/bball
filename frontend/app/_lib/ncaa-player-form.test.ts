import { describe, expect, it } from "vitest";
import { buildNcaaRecentForm } from "./ncaa-player-form";

const game = (stats: Record<string, number | null | undefined>) => ({ stats });

describe("NCAA player recent form", () => {
  it("pools shooting efficiency and compares the newest window with the prior window", () => {
    const result = buildNcaaRecentForm([
      game({ pts: 20, mins: 30, fga: 10, fta: 4 }),
      game({ pts: 10, mins: 20, fga: 10, fta: 0 }),
      game({ pts: 30, mins: 40, fga: 20, fta: 0 }),
      game({ pts: 8, mins: 20, fga: 10, fta: 0 }),
    ], 2);
    expect(result.window_games).toBe(2);
    expect(result.points_per_game).toBe(15);
    expect(result.minutes_per_game).toBe(25);
    expect(result.true_shooting).toBeCloseTo(30 / (2 * (20 + 0.475 * 4)));
    expect(result.prior_points_per_game).toBe(19);
    expect(result.points_delta).toBe(-4);
  });

  it("keeps missing fields unavailable and guards zero shooting denominators", () => {
    const result = buildNcaaRecentForm([
      game({ pts: 12, mins: null, fga: 0, fta: 0 }),
      game({ pts: null, mins: 18, fga: null, fta: 2 }),
      game({ pts: 9, mins: 19, fga: 8, fta: 2 }),
    ], 2);
    expect(result.points_per_game).toBe(12);
    expect(result.minutes_per_game).toBe(18);
    expect(result.true_shooting).toBeNull();
    expect(result.shooting_games).toBe(0);
    expect(result.points_delta).toBe(3);
  });

  it("returns unavailable comparisons when the preceding window has no points", () => {
    const result = buildNcaaRecentForm([game({ pts: 14, mins: 25 })], 5);
    expect(result.window_games).toBe(1);
    expect(result.points_per_game).toBe(14);
    expect(result.prior_points_per_game).toBeNull();
    expect(result.points_delta).toBeNull();
  });
});
