import { describe, expect, it } from "vitest";
import { footballMarketStatusDetail } from "./football-market-status";

const base = {
  qualifyingMarketObservations: 301,
  marketObservations: 876,
  gamesWithComparisons: 102,
  settledMarketComparisons: 0,
  settledModelGames: 36,
  winnerAccuracy: 0.9166667,
  marginMae: 18.6075,
};

describe("football market status", () => {
  it("keeps qualifying quotes separate from settled model-to-line results", () => {
    const text = footballMarketStatusDetail(base);
    expect(text).toContain("301 qualifying pregame quote observations across 102 games");
    expect(text).toContain("No settled model-to-line comparison is available yet");
    expect(text).toContain("91.7% on winner picks");
  });

  it("does not call an empty ledger a line result", () => {
    const text = footballMarketStatusDetail({ ...base, qualifyingMarketObservations: 0, gamesWithComparisons: 0 });
    expect(text).toContain("no qualifying pregame quote observations");
    expect(text).not.toContain("settled model-to-line");
  });

  it("labels settled market comparisons when the ledger supplies them", () => {
    const text = footballMarketStatusDetail({ ...base, settledMarketComparisons: 4 });
    expect(text).toContain("4 settled model-to-line comparisons are available");
  });
});
