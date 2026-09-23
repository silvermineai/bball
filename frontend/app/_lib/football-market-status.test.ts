import { describe, expect, it } from "vitest";
import { footballMarketArchiveDetail, footballMarketCaptureDetail, footballMarketStatusDetail } from "./football-market-status";

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

  it("reports connector coverage without turning an empty capture into a no-line claim", () => {
    const text = footballMarketCaptureDetail({ summary_count: 20, summary_with_pickcenter: 0, accepted_markets: 0, rejected_records: 0 });
    expect(text).toContain("checked 20 future game summaries");
    expect(text).toContain("0 included complete market quotes");
    expect(text).not.toContain("no line");
  });

  it("keeps malformed connector counts unavailable", () => {
    expect(footballMarketCaptureDetail({ summary_count: -1, summary_with_pickcenter: 2 })).toBe("");
  });

  it("keeps the retained archive denominator beside the pregame count", () => {
    expect(footballMarketArchiveDetail({
      total: 25405,
      pregame: 1447,
      research_receipts: 15,
      research_latest_capture_at: "2026-09-23T02:00:00Z",
    })).toBe("The football archive holds 25,405 retained market rows; 1,447 carry a pregame capture flag. The latest capture receipt is 2026-09-23T02:00:00Z.");
  });

  it("withholds malformed archive counters instead of reporting zero coverage", () => {
    expect(footballMarketArchiveDetail({ total: -1, pregame: 2 })).toBe("The football archive holds an unavailable number of retained market rows; 2 carry a pregame capture flag.");
    expect(footballMarketArchiveDetail({ total: -1, pregame: -1 })).toBe("");
  });

});
