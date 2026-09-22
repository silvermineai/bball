import { describe, expect, it } from "vitest";
import { basketballCalibrationContext, basketballCalibrationSummary, exactBasketballCalibrationContext } from "./basketball-calibration";

describe("basketball calibration summary", () => {
  it("weights calibration error and interval coverage by held-out games", () => {
    const summary = basketballCalibrationSummary([
      { games: 80, gap: 0.05, interval_coverage: 0.8 },
      { games: 20, gap: -0.1, interval_coverage: 0.6 },
    ]);
    expect(summary.games).toBe(100);
    expect(summary.expectedCalibrationError).toBeCloseTo(0.06);
    expect(summary.maximumAbsoluteGap).toBeCloseTo(0.1);
    expect(summary.intervalCoverage).toBeCloseTo(0.76);
  });

  it("fails closed when there are no valid buckets", () => {
    expect(basketballCalibrationSummary([
      { games: 0, gap: 0, interval_coverage: 0 },
      { games: 3, gap: Number.NaN, interval_coverage: 0.8 },
    ])).toEqual({ games: 0, expectedCalibrationError: null, maximumAbsoluteGap: null, intervalCoverage: null });
  });

  it("maps an upcoming probability to held-out context and inverts away bands", () => {
    const buckets = [
      { lower: 0.5, upper: 0.6, games: 80, predicted: 0.54, observed: 0.5 },
      { lower: 0.7, upper: 0.8, games: 20, predicted: 0.74, observed: 0.8 },
    ];
    expect(basketballCalibrationContext(0.72, buckets)).toEqual({
      side: "Home",
      confidence_lower: 0.7,
      confidence_upper: 0.8,
      games: 20,
      predicted: 0.74,
      observed: 0.8,
      observed_gap_pp: 6,
    });
    expect(basketballCalibrationContext(0.28, [{ lower: 0.2, upper: 0.3, games: 25, predicted: 0.26, observed: 0.16 }])).toMatchObject({
      side: "Away",
      confidence_lower: 0.7,
      confidence_upper: 0.8,
      predicted: 0.74,
      observed: 0.84,
      observed_gap_pp: 10,
    });
    expect(basketballCalibrationContext(0.72, [])).toBeNull();
  });

  it("withholds a band when the replay belongs to another model edition", () => {
    const buckets = [{ lower: 0.7, upper: 0.8, games: 20, predicted: 0.74, observed: 0.8 }];
    expect(exactBasketballCalibrationContext(0.72, buckets, "model-current", "model-old")).toBeNull();
    expect(exactBasketballCalibrationContext(0.72, buckets, "model-current", "model-current")).toMatchObject({ games: 20, side: "Home" });
    expect(exactBasketballCalibrationContext(0.72, buckets, "", "model-current")).toBeNull();
  });
});
