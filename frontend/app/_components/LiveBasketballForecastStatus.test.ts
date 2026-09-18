import { describe, expect, it } from "vitest";
import { formatForecastCoverage } from "./LiveBasketballForecastStatus";

describe("forecast coverage status", () => {
  it("shows model rows beside the upcoming-game denominator", () => {
    expect(formatForecastCoverage(1629, 1629)).toBe("1,629 model rows for 1,629 upcoming games");
  });

  it("does not manufacture a coverage claim from invalid metadata", () => {
    expect(formatForecastCoverage(undefined, 1629)).toBe("");
    expect(formatForecastCoverage(1629, -1)).toBe("");
  });
});
