import { describe, expect, it } from "vitest";
import { projectScore } from "./score-projection";

describe("score projection lesson", () => {
  it("combines opponent terms, pace and home court transparently", () => {
    const result = projectScore({
      homeOffense: 112,
      awayOffense: 108,
      homeDefense: 96,
      awayDefense: 101,
      pace: 70,
      homeCourt: 3,
    });
    expect(result.homeEfficiency).toBe(109.5);
    expect(result.awayEfficiency).toBe(102);
    expect(result.homeScore).toBeCloseTo(76.65, 8);
    expect(result.awayScore).toBeCloseTo(71.4, 8);
    expect(result.margin).toBeCloseTo(5.25, 8);
    expect(result.total).toBeCloseTo(148.05, 8);
  });

  it("keeps the entire result unavailable when an input is missing", () => {
    const result = projectScore({
      homeOffense: 112,
      awayOffense: 108,
      homeDefense: null,
      awayDefense: 101,
      pace: 70,
      homeCourt: 3,
    });
    expect(result.homeScore).toBeNull();
    expect(result.awayScore).toBeNull();
    expect(result.margin).toBeNull();
  });
});
