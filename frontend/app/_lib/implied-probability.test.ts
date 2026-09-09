import { describe, expect, it } from "vitest";
import {
  americanOddsToImplied,
  expectedValuePerUnit,
  noVigProbability,
  overround,
} from "./implied-probability";

describe("implied probability helpers", () => {
  it("converts both American odds directions", () => {
    expect(americanOddsToImplied(150)).toBeCloseTo(0.4);
    expect(americanOddsToImplied(-150)).toBeCloseTo(0.6);
    expect(americanOddsToImplied(0)).toBeNull();
  });

  it("normalizes a two-way market and exposes its overround", () => {
    expect(noVigProbability(-110, -110)).toBeCloseTo(0.5);
    expect(overround(-110, -110)).toBeCloseTo(1 / 21, 6);
    expect(noVigProbability(-110, null)).toBeNull();
  });

  it("calculates model expected value per unit staked", () => {
    expect(expectedValuePerUnit(0.5, 100)).toBeCloseTo(0);
    expect(expectedValuePerUnit(0.5, -110)).toBeCloseTo(-0.0454545, 6);
    expect(expectedValuePerUnit(1.1, 100)).toBeNull();
  });
});
