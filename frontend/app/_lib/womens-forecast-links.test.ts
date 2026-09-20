import { describe, expect, it } from "vitest";
import {
  WOMENS_FORECAST_API_HREF,
  WOMENS_FORECAST_READINESS_HREF,
  WOMENS_FORECAST_SLATE_HREF,
} from "./womens-forecast-links";

describe("women's forecast entry points", () => {
  it("keeps the primary women’s links scoped to the women’s edition", () => {
    expect(WOMENS_FORECAST_API_HREF).toBe("/api/basketball/research/womens-forecasts?season=2027");
    expect(WOMENS_FORECAST_READINESS_HREF).toContain("gender=women&division=1");
    expect(WOMENS_FORECAST_SLATE_HREF).toContain("gender=women&division=1");
  });

  it("does not point women’s forecast actions at the men’s model route", () => {
    expect(`${WOMENS_FORECAST_API_HREF} ${WOMENS_FORECAST_READINESS_HREF} ${WOMENS_FORECAST_SLATE_HREF}`).not.toContain("forecast-lab");
  });
});
