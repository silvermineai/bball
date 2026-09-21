import { describe, expect, it } from "vitest";
import type { Comparison } from "./research-types";
import { completeForecastLabMarketQuotes, forecastLabQuoteIdentity, hasCompleteForecastLabMarket, latestForecastLabMarketQuote } from "./forecast-lab-market";

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
    expect(latestForecastLabMarketQuote([
      quote({ captured_at: "not-a-clock", updated_at: "also-not-a-clock" }),
    ], "spreads")).toBeNull();
  });

  it("requires a no-vig probability for a moneyline quote", () => {
    const incomplete = quote({ market: "h2h", line: null, market_home_probability: null });
    const complete = quote({ market: "h2h", line: null, market_home_probability: 0.56, updated_at: "2026-09-10T12:00:00Z" });
    expect(latestForecastLabMarketQuote([complete, incomplete], "h2h")).toBe(complete);
  });

  it("counts only complete, bounded quotes as market evidence", () => {
    const incomplete = quote({ line: null });
    const invalidTotal = quote({ market: "totals", line: -1 });
    const invalidMoneyline = quote({ market: "h2h", line: null, market_home_probability: 1.2 });
    const complete = quote({ market: "totals", line: 146.5 });
    expect(completeForecastLabMarketQuotes([incomplete, invalidTotal, invalidMoneyline, complete])).toEqual([complete]);
    expect(hasCompleteForecastLabMarket([incomplete, invalidTotal, invalidMoneyline])).toBe(false);
    expect(hasCompleteForecastLabMarket([incomplete, complete])).toBe(true);
  });

  it("reports retained market identity without upgrading missing IDs", () => {
    expect(forecastLabQuoteIdentity(quote({ market_observation_id: "obs-1", market_game_id: "event-1" }))).toEqual({
      state: "exact",
      label: "Observation + source event IDs",
      observationId: "obs-1",
      marketGameId: "event-1",
    });
    expect(forecastLabQuoteIdentity(quote({ market_game_id: " event-2 " }))).toMatchObject({
      state: "event_only",
      label: "Source event ID only",
      observationId: null,
      marketGameId: "event-2",
    });
    expect(forecastLabQuoteIdentity(quote({ market_observation_id: "obs-3" }))).toMatchObject({
      state: "observation_only",
      label: "Observation ID only",
      observationId: "obs-3",
      marketGameId: null,
    });
    expect(forecastLabQuoteIdentity(quote({ market_observation_id: "  ", market_game_id: null }))).toMatchObject({
      state: "unavailable",
      label: "Market IDs unavailable",
      observationId: null,
      marketGameId: null,
    });
  });
});
