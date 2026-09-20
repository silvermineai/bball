/**
 * Canonical women-only forecast entry points used by the women’s sport desk.
 * Keeping these links in one module prevents a women’s page from silently
 * falling back to the men’s forecast lab or model endpoint.
 */
export const WOMENS_FORECAST_API_HREF = "/api/basketball/research/womens-forecasts?season=2027";
export const WOMENS_FORECAST_READINESS_HREF = "/basketball/wbb-readiness/?gender=women&division=1";
export const WOMENS_FORECAST_SLATE_HREF = "/basketball/matchups/?gender=women&division=1";
