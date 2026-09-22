import { describe, expect, it } from "vitest";
import { forecastLearningRead, nextUpcomingGameLesson } from "./upcoming-game-lesson";
import type { BBGame } from "../../_lib/basketball-types";

const game = (id: string, starts_at: string, home_margin: number): BBGame => ({
  id,
  season: 2026,
  starts_at,
  home_id: `${id}-home`,
  away_id: `${id}-away`,
  home_name: "Home U",
  away_name: "Away U",
  neutral: 0,
  time_tbd: 0,
  venue: "",
  broadcast: "",
  prediction: {
    home_score: 74,
    away_score: 70,
    home_margin,
    total: 144,
    pace: 68,
    home_win_probability: home_margin > 0 ? 0.68 : 0.48,
    margin_low: -8,
    margin_high: 12,
  },
});

describe("upcoming matchup learning lesson", () => {
  it("explains the published probability and margin range without adding a forecast", () => {
    const read = forecastLearningRead("Home U", "Away U", game("read", "2026-11-02T00:00:00Z", 8).prediction!);

    expect(read).toMatchObject({
      favoriteName: "Home U",
      favoriteProbability: 0.68,
      marginWidth: 20,
      intervalReading: "both-outcomes",
    });
    expect(read?.otherProbability).toBeCloseTo(0.32, 10);
    expect(read?.probabilityReading).toContain("68.0% model win estimate");
    expect(read?.uncertaintyReading).toContain("includes both teams winning");
    expect(read?.studyPrompt).toContain("first possession-level signal");
  });

  it("withholds impossible probabilities and inconsistent ranges", () => {
    const invalid = game("invalid", "2026-11-02T00:00:00Z", 8).prediction!;
    expect(forecastLearningRead("Home U", "Away U", { ...invalid, home_win_probability: 1.01 })).toBeNull();
    expect(forecastLearningRead("Home U", "Away U", { ...invalid, margin_low: 20 })).toBeNull();
  });

  it("selects the earliest complete forecast and preserves its uncertainty", () => {
    const lesson = nextUpcomingGameLesson([
      game("later", "2026-11-04T00:00:00Z", -2),
      game("first", "2026-11-02T00:00:00Z", 8),
    ]);
    expect(lesson?.game.id).toBe("first");
    expect(lesson?.favoriteName).toBe("Home U");
    expect(lesson?.marginReading).toBe("both-outcomes");
    expect(lesson?.forecastReading).toBe("lean");
    expect(lesson?.learningRead.intervalReading).toBe("both-outcomes");
  });

  it("prefers a primary forecast, rejects incomplete rows, and labels a tie", () => {
    const incomplete = game("bad", "2026-11-01T00:00:00Z", 0);
    incomplete.prediction = { ...incomplete.prediction!, margin_high: Number.NaN };
    const fallback = game("fallback", "2026-11-02T00:00:00Z", 0);
    fallback.prediction = null;
    fallback.fallback_prediction = { ...game("source", "2026-11-03T00:00:00Z", 0).prediction! };
    const lesson = nextUpcomingGameLesson([incomplete, fallback]);
    expect(lesson?.game.id).toBe("fallback");
    expect(lesson?.prediction).toBe(fallback.fallback_prediction);
    expect(lesson?.favoriteName).toBeNull();
    expect(nextUpcomingGameLesson([incomplete])).toBeNull();
  });
});
