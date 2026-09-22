import { describe, expect, it } from "vitest";
import { buildBriefAnalysisPacket } from "./brief-analysis-packet";

const prediction = {
  home_score: 76,
  away_score: 72,
  home_margin: 4,
  total: 148,
  pace: 69,
  home_win_probability: 0.64,
  margin_low: -8,
  margin_high: 16,
  total_low: 130,
  total_high: 166,
  total_half_width: 18,
} as const;

const complete = {
  prediction,
  modelId: "model-2027",
  forecastModelId: "model-2027",
  coefficientReproduced: true,
  startsAt: "2026-11-10T19:00:00Z",
  timeTbd: false,
  neutral: false,
  venue: "Main Arena",
  factorCount: 4,
  roster: { state: "complete" as const, label: "Both teams have roster rows" },
  marketQuoteCount: 2,
  availability: {
    state: "verified" as const,
    observed: "Confirmed availability report",
    missing: "",
  },
};

describe("brief analysis packet", () => {
  it("marks a fully reconciled evidence packet ready", () => {
    const packet = buildBriefAnalysisPacket(complete);
    expect(packet.state).toBe("ready");
    expect(packet.verifiedCount).toBe(8);
    expect(packet.items).toHaveLength(8);
    expect(packet.missingInputs).toEqual([]);
    expect(packet.items.every((item) => item.state === "verified")).toBe(true);
  });

  it("keeps missing market and availability evidence explicit", () => {
    const packet = buildBriefAnalysisPacket({
      ...complete,
      forecastModelId: undefined,
      marketQuoteCount: 0,
    });
    expect(packet.state).toBe("partial");
    expect(packet.items.find((item) => item.key === "forecast")?.state).toBe("partial");
    expect(packet.items.find((item) => item.key === "market")?.state).toBe("unavailable");
    expect(packet.items.find((item) => item.key === "availability")?.state).toBe("verified");
    expect(packet.missingInputs).toEqual([
      "Per-game model ID attachment; the static snapshot only carries the overview edition",
      "A licensed quote matched to this game, model edition and pregame clock",
    ]);
  });

  it("blocks malformed predictions and mixed model editions", () => {
    const malformed = buildBriefAnalysisPacket({
      ...complete,
      prediction: { ...prediction, home_win_probability: 1.2 },
    });
    expect(malformed.state).toBe("blocked");
    expect(malformed.items.find((item) => item.key === "forecast")?.state).toBe("blocked");

    const mixed = buildBriefAnalysisPacket({
      ...complete,
      forecastModelId: "model-old",
    });
    expect(mixed.state).toBe("blocked");
    expect(mixed.items.find((item) => item.key === "forecast")?.observed).toContain("conflicts");
  });

  it("keeps a legacy edition's missing total range actionable", () => {
    const packet = buildBriefAnalysisPacket({
      ...complete,
      prediction: {
        ...prediction,
        total_low: undefined,
        total_high: undefined,
        total_half_width: undefined,
      },
    });
    expect(packet.state).toBe("partial");
    expect(packet.items.find((item) => item.key === "total_uncertainty")).toMatchObject({
      state: "unavailable",
      observed: "No independent total range is published for this model edition",
    });
    expect(packet.missingInputs).toContain(
      "A calibrated total range before using the projected total for scenario planning",
    );
  });

  it("blocks an attached total range that is internally inconsistent", () => {
    const packet = buildBriefAnalysisPacket({
      ...complete,
      prediction: { ...prediction, total_half_width: 17 },
    });
    expect(packet.state).toBe("blocked");
    expect(packet.items.find((item) => item.key === "total_uncertainty")).toMatchObject({
      state: "blocked",
      observed: "Published total range failed its integrity checks",
    });
  });

  it("does not call a TBD schedule or absent historical factors ready", () => {
    const packet = buildBriefAnalysisPacket({
      ...complete,
      timeTbd: true,
      factorCount: 0,
      roster: { state: "partial", label: "1 of 2 teams has roster rows" },
    });
    expect(packet.state).toBe("partial");
    expect(packet.items.find((item) => item.key === "schedule")?.state).toBe("partial");
    expect(packet.items.find((item) => item.key === "matchup_context")?.state).toBe("unavailable");
    expect(packet.items.find((item) => item.key === "roster")?.state).toBe("partial");
    expect(packet.missingInputs).toContain("Confirmed start time before final pre-tip planning");
    expect(packet.missingInputs).toContain("At least one historical factor pair with valid games, ranks and rates");
  });
});
