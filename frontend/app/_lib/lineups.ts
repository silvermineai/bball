export type LineupDirection = "desc" | "asc";
export type LineupFilters = {
  season: number;
  metric: string;
  minPoss: string;
  direction: LineupDirection;
  query: string;
  page: number;
};

const metrics = new Set([
  "net_per_100",
  "off_rtg",
  "def_rtg",
  "poss",
  "duration_mins",
  "games",
  "plus_minus",
]);
const thresholds = new Set(["0", "20", "40", "100", "200"]);

/** Read only supported lineup controls from a shareable query string. */
export function parseLineupFilters(search: string): LineupFilters {
  const params = new URLSearchParams(search);
  const season = Number(params.get("season"));
  const page = Number(params.get("page"));
  const requestedMetric = params.get("metric") || "net_per_100";
  const requestedThreshold = params.get("minPoss") || "40";
  return {
    season: Number.isInteger(season) && season >= 2019 && season <= 2026 ? season : 2026,
    metric: metrics.has(requestedMetric) ? requestedMetric : "net_per_100",
    minPoss: thresholds.has(requestedThreshold) ? requestedThreshold : "40",
    direction: params.get("direction") === "asc" ? "asc" : "desc",
    query: params.get("q") || "",
    page: Number.isInteger(page) && page > 0 && page <= 250 ? page : 0,
  };
}

/** Serialize non-default lineup controls into a compact URL. */
export function lineupFilterSearch(filters: LineupFilters) {
  const params = new URLSearchParams();
  if (filters.season !== 2026) params.set("season", String(filters.season));
  if (filters.metric !== "net_per_100") params.set("metric", filters.metric);
  if (filters.minPoss !== "40") params.set("minPoss", filters.minPoss);
  if (filters.direction !== "desc") params.set("direction", filters.direction);
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.page) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
