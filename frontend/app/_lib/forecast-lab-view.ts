export type ForecastLabView = "all" | "scenario" | "cold-start" | "market";
export type ForecastLabSort = "date" | "disagreement" | "confidence" | "uncertainty";

const views = new Set<ForecastLabView>(["all", "scenario", "cold-start", "market"]);
const sorts = new Set<ForecastLabSort>(["date", "disagreement", "confidence", "uncertainty"]);

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
