import { describe, expect, it } from "vitest";
import { formatEvaluationCoverage, formatForecastCoverage, forecastEditionNotice } from "./LiveBasketballForecastStatus";

describe("forecast coverage status", () => {
  it("shows model rows beside the upcoming-game denominator", () => {
    expect(formatForecastCoverage(1629, 1629)).toBe("1,629 model rows for 1,629 upcoming games");
  });

  it("does not manufacture a coverage claim from invalid metadata", () => {
    expect(formatForecastCoverage(undefined, 1629)).toBe("");
    expect(formatForecastCoverage(1629, -1)).toBe("");
  });

  it("separates scored and unscored held-out rows", () => {
    expect(formatEvaluationCoverage(5734, 564)).toBe("5,734 held-out rows (5,170 scored, 564 unscored)");
  });

  it("does not manufacture evaluation coverage from invalid metadata", () => {
    expect(formatEvaluationCoverage(5734, undefined)).toBe("");
    expect(formatEvaluationCoverage(5734, 5735)).toBe("");
    expect(formatEvaluationCoverage(-1, 0)).toBe("");
  });

  it("calls out a live model that is newer than the bundled context", () => {
    expect(forecastEditionNotice("live-v2", "bundle-v1", "2026-09-17T10:24:29Z"))
      .toBe("Live rows use a newer registered model edition; this page's bundled context is from Sep 17, 2026.");
    expect(forecastEditionNotice("same", "same", "2026-09-17T10:24:29Z")).toBe("");
  });
});
