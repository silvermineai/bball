import { describe, expect, it } from "vitest";
import { normalizeMarketSeason } from "./market-view";

describe("market archive season selection", () => {
  it("preserves the explicit all-season view while metadata loads", () => {
    expect(normalizeMarketSeason("all", [2026, 2025])).toBe("all");
  });

  it("keeps valid seasons and falls back invalid requests to the newest release", () => {
    expect(normalizeMarketSeason("2025", [2026, 2025])).toBe("2025");
    expect(normalizeMarketSeason("1900", [2026, 2025])).toBe("2026");
  });
});
