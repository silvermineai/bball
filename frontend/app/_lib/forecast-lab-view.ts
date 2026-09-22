export type ForecastLabView = "all" | "coverage-gap" | "scenario" | "cold-start" | "market" | "model-delta" | "factor";
export type ForecastLabSort = "date" | "coverage" | "disagreement" | "confidence" | "uncertainty" | "factor";

export type ForecastModelOption = {
  model_id: string;
  version?: string | null;
  forecasts: number;
  primary_forecasts?: number;
  cold_start_forecasts?: number;
  invalid_forecasts?: number;
  last_created_at?: string | null;
  target_season?: number | null;
  expected_forecasts?: number | null;
  publication_complete?: boolean;
};

/**
 * Select only a complete model edition for the requested forecast season.
 * Catalog rows can include historical editions and an in-flight publication;
 * neither is safe to label as the live 2026–27 model in the UI.
 */
export function selectPublishedForecastModel<T extends {
  model_id?: string | null;
  target_season?: number | null;
  forecasts?: number | null;
  publication_complete?: boolean;
}>(models: T[] | null | undefined, targetSeason = 2027): T | null {
  return models?.find((model) =>
    typeof model.model_id === "string"
    && model.model_id.trim().length > 0
    && model.target_season === targetSeason
    && model.publication_complete === true
    && Number.isInteger(model.forecasts)
    && (model.forecasts ?? 0) > 0,
  ) || null;
}

/** Return a held-out baseline delta only when both MAEs are valid. */
export function baselineMarginDelta(
  modelMae: number | null | undefined,
  baselineMae: number | null | undefined,
) {
  if (
    modelMae == null || baselineMae == null
    || !Number.isFinite(modelMae) || !Number.isFinite(baselineMae)
    || modelMae < 0 || baselineMae <= 0
  ) return null;
  return Number((baselineMae - modelMae).toFixed(2));
}

/** Keep repeated model versions distinguishable in the audit selector. */
export const formatForecastModelOption = (model: ForecastModelOption): string => {
  const captured = model.last_created_at
    ? new Date(model.last_created_at)
    : null;
  const date = captured && Number.isFinite(captured.getTime())
    ? captured.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : "date unavailable";
  const fingerprint = model.model_id.split("-").pop() || model.model_id;
  const metadata = model.target_season == null ? " · metadata unavailable" : "";
  const estimateMix = model.primary_forecasts != null || model.cold_start_forecasts != null
    ? ` (${(model.primary_forecasts ?? 0).toLocaleString()} primary, ${(model.cold_start_forecasts ?? 0).toLocaleString()} cold-start${model.invalid_forecasts ? `, ${model.invalid_forecasts.toLocaleString()} invalid` : ""})`
    : "";
  return `${model.version || "Unlabeled edition"} · ${date} · ${model.forecasts.toLocaleString()} rows${estimateMix} · ${fingerprint}${metadata}`;
};

const views = new Set<ForecastLabView>(["all", "coverage-gap", "scenario", "cold-start", "market", "model-delta", "factor"]);
const sorts = new Set<ForecastLabSort>(["date", "coverage", "disagreement", "confidence", "uncertainty", "factor"]);

export const parseForecastLabFilters = (search: string) => {
  const params = new URLSearchParams(search);
  const view = params.get("view") as ForecastLabView | null;
  const sort = params.get("sort") as ForecastLabSort | null;
  return {
    query: params.get("q") || "",
    gameId: params.get("game") || "",
    model: params.get("model") || "latest",
    view: view && views.has(view) ? view : "all",
    sort: sort && sorts.has(sort) ? sort : "date",
  };
};

export const forecastLabFilterSearch = ({
  query,
  view,
  sort,
  gameId,
  model,
}: {
  query: string;
  view: ForecastLabView;
  sort: ForecastLabSort;
  gameId: string;
  model: string;
}) => {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (view !== "all") params.set("view", view);
  if (sort !== "date") params.set("sort", sort);
  if (gameId) params.set("game", gameId);
  if (model && model !== "latest") params.set("model", model);
  const value = params.toString();
  return value ? `?${value}` : "";
};
