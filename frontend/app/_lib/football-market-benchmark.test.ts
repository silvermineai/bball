import { describe, expect, it } from "vitest";
import { marginDisagreementBands, pairedFootballMarketErrors, type FootballMarketBenchmarkRow } from "./football-market-benchmark";

const row = (values: Partial<FootballMarketBenchmarkRow>): FootballMarketBenchmarkRow => ({
  actual_margin: 0,
  actual_total: 40,
  model_margin: 0,
  model_total: 40,
  archived_margin: 0,
  archived_total: 40,
  ...values,
});

describe("football market benchmark analysis", () => {
  it("compares model and archive only on paired finite observations", () => {
    const result = pairedFootballMarketErrors([
      row({ actual_margin: 4, model_margin: 5, archived_margin: 8, actual_total: 50, model_total: 48, archived_total: 45 }),
      row({ actual_margin: -3, model_margin: 1, archived_margin: -2, actual_total: 44, model_total: 47, archived_total: 47 }),
      row({ actual_margin: 2, model_margin: 2, archived_margin: null, actual_total: 38, model_total: 38, archived_total: null }),
    ]);
    expect(result.margin).toEqual({ games: 2, model_better: 1, archive_better: 1, ties: 0, model_mae: 2.5, archive_mae: 2.5 });
    expect(result.total).toEqual({ games: 2, model_better: 1, archive_better: 0, ties: 1, model_mae: 2.5, archive_mae: 4 });
  });

  it("groups paired margin errors by absolute model-to-line disagreement", () => {
    const bands = marginDisagreementBands([
      row({ actual_margin: 1, model_margin: 2, archived_margin: 0 }),
      row({ actual_margin: 2, model_margin: 5, archived_margin: 1 }),
      row({ actual_margin: -2, model_margin: 8, archived_margin: -1 }),
      row({ actual_margin: 0, model_margin: 10, archived_margin: null }),
    ]);
    expect(bands.map(({ key, games }) => [key, games])).toEqual([["under-3", 1], ["3-to-7", 1], ["7-plus", 1]]);
    expect(bands[2]).toMatchObject({ model_better: 0, archive_better: 1, ties: 0, model_mae: 10, archive_mae: 1 });
  });
});
