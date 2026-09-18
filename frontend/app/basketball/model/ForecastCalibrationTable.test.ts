import { describe, expect, it } from "vitest";
import { buildCalibrationBuckets } from "./ForecastCalibrationTable";

describe("forecast calibration bands", () => {
  it("groups calibrated probabilities and reports observed rates and range coverage", () => {
    const buckets = buildCalibrationBuckets([
      { raw_prediction: { home_margin: 0 }, game: { home_score: 80, away_score: 70 } },
      { raw_prediction: { home_margin: 0 }, game: { home_score: 70, away_score: 80 } },
      { raw_prediction: { home_margin: 10 }, game: { home_score: 90, away_score: 80 } },
    ], [0, 0.1], 10);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ label: "50–59%", games: 2, predicted: 0.5, observed: 0.5, gap: 0, interval_coverage: 1 });
    expect(buckets[1]).toMatchObject({ label: "70–79%", games: 1, observed: 1, interval_coverage: 1 });
  });

  it("withholds malformed replay rows instead of treating them as losses", () => {
    expect(buildCalibrationBuckets([{ raw_prediction: { home_margin: null }, game: { home_score: 80, away_score: 70 } }], [0, 0.1], 10)).toEqual([]);
  });
});
