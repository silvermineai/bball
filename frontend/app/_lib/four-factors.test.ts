import { describe, expect, it } from "vitest";
import { calculateFourFactors } from "./four-factors";

describe("four factors calculator", () => {
  it("uses the disclosed college possession and rate denominators", () => {
    const result = calculateFourFactors({
      fieldGoalsMade: 30,
      threePointersMade: 8,
      fieldGoalsAttempted: 60,
      turnovers: 12,
      offensiveRebounds: 10,
      opponentDefensiveRebounds: 24,
      freeThrowsAttempted: 18,
    });
    expect(result.estimatedPossessions).toBeCloseTo(70.55, 6);
    expect(result.effectiveFieldGoal).toBeCloseTo(34 / 60, 6);
    expect(result.turnoverRate).toBeCloseTo(12 / 70.55, 6);
    expect(result.offensiveReboundRate).toBeCloseTo(10 / 34, 6);
    expect(result.freeThrowRate).toBeCloseTo(18 / 60, 6);
  });

  it("withholds rates when their source denominator is incomplete", () => {
    const result = calculateFourFactors({
      fieldGoalsMade: 30,
      threePointersMade: null,
      fieldGoalsAttempted: 60,
      turnovers: 12,
      offensiveRebounds: 10,
      opponentDefensiveRebounds: null,
      freeThrowsAttempted: 18,
    });
    expect(result.effectiveFieldGoal).toBeNull();
    expect(result.offensiveReboundRate).toBeNull();
    expect(result.freeThrowRate).toBeCloseTo(0.3, 6);
  });
});
