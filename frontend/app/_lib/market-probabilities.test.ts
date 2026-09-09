import { describe, expect, it } from "vitest";
import { intervalStandardDeviation, normalCdf, spreadCoverProbability } from "./market-probabilities";

describe("market probability helpers", () => {
  it("keeps the normal CDF bounded and centered", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(-8)).toBeGreaterThanOrEqual(0);
    expect(normalCdf(8)).toBeLessThanOrEqual(1);
    expect(normalCdf(-8)).toBeLessThan(0.001);
    expect(normalCdf(8)).toBeGreaterThan(0.999);
  });

  it("derives a standard deviation from the published nominal interval", () => {
    expect(intervalStandardDeviation(-10, 10)).toBeCloseTo(10 / 1.2815515655446004);
    expect(intervalStandardDeviation(4, 4)).toBeNull();
    expect(intervalStandardDeviation(null, 10)).toBeNull();
  });

  it("calculates an explicit cover probability and keeps invalid lines unavailable", () => {
    expect(spreadCoverProbability(3, -7, 13, -3)).toBeCloseTo(0.5, 6);
    expect(spreadCoverProbability(8, -2, 18, -3)).toBeGreaterThan(0.7);
    expect(spreadCoverProbability(3, -7, 13, null)).toBeNull();
  });
});
