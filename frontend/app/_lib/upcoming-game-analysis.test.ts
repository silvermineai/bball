import { describe, expect, it } from "vitest";
import { buildUpcomingGameAnalysis, normalizeEstimateType } from "./upcoming-game-analysis";

describe("upcoming game analysis", () => {
  const complete = {
    gameId: "401",
    homeId: "66",
    awayId: "2755",
    modelId: "wbb-model-1",
    prediction: {
      homeWinProbability: 0.8734,
      margin: 16.02,
      scoreHome: 79,
      scoreAway: 63,
      marginLow: -3.17,
      marginHigh: 35.21,
      estimateType: "primary",
    },
    schedule: { date: "2026-11-02T05:00Z", venue: "Arena" },
    marketQuoteCount: 0,
  } as const;

  it("summarizes a valid exact-ID forecast without treating no market as an error", () => {
    const result = buildUpcomingGameAnalysis(complete);
    expect(result.state).toBe("ready");
    expect(result.lean).toBe("home");
    expect(result.confidence).toBe("strong");
    expect(result.uncertainty).toBe("wide");
    expect(result.identity).toEqual({ gameId: "401", homeId: "66", awayId: "2755" });
    expect(result.evidence).toContain("no qualifying market quote");
  });

  it("keeps cold-start and missing source fields explicit", () => {
    const result = buildUpcomingGameAnalysis({
      ...complete,
      modelId: null,
      homeId: null,
      prediction: { ...complete.prediction, estimateType: "cold_start", marginLow: null, marginHigh: null },
      schedule: { date: null },
      marketQuoteCount: null,
    });
    expect(result.state).toBe("partial");
    expect(result.estimate).toBe("cold-start");
    expect(result.marginLow).toBeNull();
    expect(result.uncertainty).toBe("unavailable");
    expect(result.missing).toEqual(expect.arrayContaining(["model edition identity", "exact game/team identity", "parseable source schedule date", "venue", "market quote count"]));
  });

  it("withholds a malformed forecast instead of making a lean", () => {
    const result = buildUpcomingGameAnalysis({ gameId: "401", prediction: { homeWinProbability: 1.2, margin: 4 } });
    expect(result.state).toBe("unavailable");
    expect(result.lean).toBe("unavailable");
    expect(result.confidence).toBe("unavailable");
    expect(result.estimate).toBe("unavailable");
  });

  it("does not promote an explicit unknown estimate type to primary", () => {
    const result = buildUpcomingGameAnalysis({
      ...complete,
      prediction: { ...complete.prediction, estimateType: "experimental_v9" },
    });
    expect(result.state).toBe("unavailable");
    expect(result.estimate).toBe("unavailable");
    expect(result.lean).toBe("unavailable");
    expect(result.missing).toContain("recognized estimate type");
  });

  it("keeps legacy omitted labels as primary and recognizes cold-start spelling", () => {
    expect(normalizeEstimateType(undefined)).toBe("primary");
    expect(normalizeEstimateType("cold_start")).toBe("cold-start");
    expect(normalizeEstimateType("cold-start")).toBe("cold-start");
    expect(normalizeEstimateType("future_model")).toBeNull();
  });
});
