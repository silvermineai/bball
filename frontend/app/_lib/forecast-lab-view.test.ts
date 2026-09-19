import { describe, expect, it } from "vitest";
import { baselineMarginDelta, forecastLabFilterSearch, formatForecastModelOption, parseForecastLabFilters } from "./forecast-lab-view";

describe("forecast lab filters", () => {
  it("round-trips a selected market game with the lab view", () => {
    const filters = parseForecastLabFilters("?q=Duke&view=market&sort=confidence&game=401912207");
    expect(filters).toEqual({ query: "Duke", view: "market", sort: "confidence", gameId: "401912207", model: "latest" });
    expect(forecastLabFilterSearch(filters)).toBe("?q=Duke&view=market&sort=confidence&game=401912207");
  });

  it("drops invalid controls instead of writing them back", () => {
    expect(parseForecastLabFilters("?view=unknown&sort=bad&game=abc")).toEqual({ query: "", view: "all", sort: "date", gameId: "abc", model: "latest" });
  });

  it("round-trips an explicit stored model edition", () => {
    const filters = parseForecastLabFilters("?model=model-2027-a");
    expect(filters.model).toBe("model-2027-a");
    expect(forecastLabFilterSearch(filters)).toBe("?model=model-2027-a");
  });
  it("round-trips the model edition delta view", () => {
    const filters = parseForecastLabFilters("?view=model-delta&model=model-2027-a");
    expect(filters.view).toBe("model-delta");
    expect(forecastLabFilterSearch(filters)).toBe("?view=model-delta&model=model-2027-a");
  });

  it("round-trips the compact matchup-factor controls", () => {
    const filters = parseForecastLabFilters("?view=factor&sort=factor");
    expect(filters.view).toBe("factor");
    expect(filters.sort).toBe("factor");
    expect(forecastLabFilterSearch(filters)).toBe("?view=factor&sort=factor");
  });

  it("round-trips the evidence-gap audit controls", () => {
    const filters = parseForecastLabFilters("?view=coverage-gap&sort=coverage");
    expect(filters.view).toBe("coverage-gap");
    expect(filters.sort).toBe("coverage");
    expect(forecastLabFilterSearch(filters)).toBe("?view=coverage-gap&sort=coverage");
  });

  it("calculates a signed holdout margin delta and fails closed on bad metadata", () => {
    expect(baselineMarginDelta(10.2640704569, 11.9590124948)).toBe(1.69);
    expect(baselineMarginDelta(12, 10)).toBe(-2);
    expect(baselineMarginDelta(Number.NaN, 11)).toBeNull();
    expect(baselineMarginDelta(10, 0)).toBeNull();
  });

  it("keeps repeated model versions auditable in the selector label", () => {
    expect(formatForecastModelOption({
      model_id: "basketball-efficiency-v2-65f2629d5bd3",
      version: "basketball-efficiency-v2",
      forecasts: 1629,
      primary_forecasts: 1579,
      cold_start_forecasts: 50,
      last_created_at: "2026-09-12T07:18:21.423011Z",
      target_season: 2027,
    })).toBe("basketball-efficiency-v2 · Sep 12 · 1,629 rows (1,579 primary, 50 cold-start) · 65f2629d5bd3");
    expect(formatForecastModelOption({
      model_id: "basketball-efficiency-v2-338f9be0c3b6",
      forecasts: 1579,
      last_created_at: null,
      target_season: null,
    })).toBe("Unlabeled edition · date unavailable · 1,579 rows · 338f9be0c3b6 · metadata unavailable");
  });

});
