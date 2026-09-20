import { describe, expect, it } from "vitest";
import { resolveForecastEdition } from "./forecast-edition";

describe("forecast edition resolution", () => {
  it("keeps exact per-game metadata when live hydration provides it", () => {
    expect(resolveForecastEdition(
      {
        forecast_model_id: " model-live ",
        forecast_created_at: "2026-09-18T12:00:00Z",
      },
      { modelId: "model-static", generatedAt: "2026-09-17T10:00:00Z" },
    )).toEqual({
      modelId: "model-live",
      generatedAt: "2026-09-18T12:00:00Z",
    });
  });

  it("uses the bundled edition for static rows without per-game fields", () => {
    expect(resolveForecastEdition(
      { forecast_model_id: null, forecast_created_at: null },
      { modelId: "model-static", generatedAt: "2026-09-17T10:00:00Z" },
    )).toEqual({
      modelId: "model-static",
      generatedAt: "2026-09-17T10:00:00Z",
    });
  });

  it("withholds malformed row metadata rather than masking it with invalid text", () => {
    expect(resolveForecastEdition(
      { forecast_model_id: "  ", forecast_created_at: "not-a-clock" },
      { modelId: "model-static", generatedAt: "also-not-a-clock" },
    )).toEqual({ modelId: "model-static", generatedAt: null });
  });
});
