import { describe, expect, it } from "vitest";
import { forecastLabFilterSearch, parseForecastLabFilters } from "./forecast-lab-view";

describe("forecast lab filters", () => {
  it("round-trips a selected market game with the lab view", () => {
    const filters = parseForecastLabFilters("?q=Duke&view=market&sort=confidence&game=401912207");
    expect(filters).toEqual({ query: "Duke", view: "market", sort: "confidence", gameId: "401912207" });
    expect(forecastLabFilterSearch(filters)).toBe("?q=Duke&view=market&sort=confidence&game=401912207");
  });

  it("drops invalid controls instead of writing them back", () => {
    expect(parseForecastLabFilters("?view=unknown&sort=bad&game=abc")).toEqual({ query: "", view: "all", sort: "date", gameId: "abc" });
  });
});
