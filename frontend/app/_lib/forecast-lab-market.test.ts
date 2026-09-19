import { describe, expect, it } from "vitest";
import type { Comparison } from "./research-types";
import { latestForecastLabMarketQuote } from "./forecast-lab-market";

const quote = (overrides: Partial<Comparison> = {}): Comparison => ({
  provider: "licensed-feed",
  bookmaker: "book-a",
  market: "spreads",
  captured_at: "2026-09-10T12:00:00Z",
  updated_at: "2026-09-10T11:00:00Z",
  line: 4.5,
  model_difference: 1.2,
  market_home_probability: null,
  ...overrides,
});

describe("Forecast Lab market quote selection", () => {
  it("selects the newest complete quote instead of trusting response order", () => {
    const stale = quote({ updated_at: "2026-09-10T11:00:00Z", line: 4.5 });
    const latest = quote({ updated_at: "2026-09-10T12:00:00Z", line: 5.5 });
    expect(latestForecastLabMarketQuote([latest, stale], "spreads")).toBe(latest);
  });

  it("rejects incomplete or non-finite quotes before display", () => {
    expect(latestForecastLabMarketQuote([
      quote({ line: null }),
      quote({ model_difference: Number.NaN }),
      quote({ market: "totals", line: 145.5 }),
    ], "spreads")).toBeNull();
  });

  it("requires a no-vig probability for a moneyline quote", () => {
    const incomplete = quote({ market: "h2h", line: null, market_home_probability: null });
    const complete = quote({ market: "h2h", line: null, market_home_probability: 0.56, updated_at: "2026-09-10T12:00:00Z" });
    expect(latestForecastLabMarketQuote([complete, incomplete], "h2h")).toBe(complete);
  });
});
