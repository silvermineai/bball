import { describe, expect, it } from "vitest";
import { basketballCalibrationSummary } from "./basketball-calibration";

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
});
