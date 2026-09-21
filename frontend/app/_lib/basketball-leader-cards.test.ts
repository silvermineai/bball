import { describe, expect, it } from "vitest";
import { compactBasketballLeaderCards } from "./basketball-leader-cards";

describe("compact basketball leader cards", () => {
  it("does not headline rates whose attempt denominators are absent", () => {
    const metrics = compactBasketballLeaderCards.map((card) => card.metric);
    expect(metrics).not.toContain("three_pct");
    expect(metrics).not.toContain("ft_pct");
    expect(metrics).toContain("ppg");
    expect(metrics).toContain("ts");
  });

  it("keeps card measures unique and labeled", () => {
    const metrics = compactBasketballLeaderCards.map((card) => card.metric);
    expect(new Set(metrics).size).toBe(metrics.length);
    expect(compactBasketballLeaderCards.every((card) => card.label && card.description)).toBe(true);
  });
});
