import type { BBGame, BBPrediction } from "./basketball-types";

export type MatchupSort =
  | "date"
  | "confidence"
  | "close"
  | "margin"
  | "uncertainty";

export type MatchupCoverage = "all" | "forecasted" | "unforecasted";
export type MatchupSignal = "all" | "toss-up" | "lean" | "strong";
export type MatchupFilters = {
  team: string;
  month: string;
  coverage: MatchupCoverage;
  signal: MatchupSignal;
  sort: MatchupSort;
  page: number;
  picks?: string[];
};

const matchupSorts = new Set<MatchupSort>([
  "date",
  "confidence",
  "close",
  "margin",
  "uncertainty",
]);
const matchupCoverages = new Set<MatchupCoverage>([
  "all",
  "forecasted",
  "unforecasted",
]);
const matchupSignals = new Set<MatchupSignal>(["all", "toss-up", "lean", "strong"]);

/** Read only supported matchup controls from a shareable query string. */
export function parseMatchupFilters(search: string): MatchupFilters {
  const params = new URLSearchParams(search);
  const sort = params.get("sort") as MatchupSort | null;
  const coverage = params.get("coverage") as MatchupCoverage | null;
  const signal = params.get("signal") as MatchupSignal | null;
  const month = params.get("month") || "all";
  const parsedPage = Number(params.get("page") || 0);
  const picks = params.getAll("pick").filter(Boolean).slice(0, 12);
  return {
    team: params.get("team") || "",
    month: month === "all" || /^\d{4}-\d{2}$/.test(month) ? month : "all",
    coverage:
      coverage && matchupCoverages.has(coverage) ? coverage : "all",
    signal: signal && matchupSignals.has(signal) ? signal : "all",
    sort: sort && matchupSorts.has(sort) ? sort : "date",
    page: Number.isInteger(parsedPage) && parsedPage >= 0 && parsedPage <= 500 ? parsedPage : 0,
    ...(picks.length ? { picks } : {}),
  };
}

/** Serialize non-default matchup controls into a compact query string. */
export function matchupFilterSearch(filters: MatchupFilters) {
  const params = new URLSearchParams();
  if (filters.team) params.set("team", filters.team);
  if (filters.month !== "all") params.set("month", filters.month);
  if (filters.coverage !== "all") params.set("coverage", filters.coverage);
  if (filters.signal !== "all") params.set("signal", filters.signal);
  if (filters.sort !== "date") params.set("sort", filters.sort);
  if (filters.page > 0) params.set("page", String(filters.page));
  for (const pick of filters.picks || []) {
    if (pick) params.append("pick", pick);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export type ForecastSignal = {
  label: "Toss-up" | "Lean" | "Strong lean";
  confidence: number;
};

/** Return the model's plain-language signal without rounding the probability. */
export function forecastSignal(prediction: BBPrediction): ForecastSignal {
  const confidence = Math.max(
    prediction.home_win_probability,
    1 - prediction.home_win_probability,
  );
  return {
    confidence,
    label:
      confidence >= 0.75
        ? "Strong lean"
        : confidence >= 0.6
          ? "Lean"
          : "Toss-up",
  };
}

/** Test a prediction against the plain-language signal bands used by the slate. */
export function matchesMatchupSignal(
  prediction: BBPrediction | null | undefined,
  signal: MatchupSignal,
) {
  if (signal === "all") return true;
  if (!prediction) return false;
  const confidence = forecastSignal(prediction).confidence;
  if (signal === "toss-up") return confidence < 0.6;
  if (signal === "lean") return confidence >= 0.6 && confidence < 0.75;
  return confidence >= 0.75;
}

function compareNumber(a: number | null, b: number | null, descending: boolean) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return descending ? b - a : a - b;
}

/** Sort a filtered slate while keeping unforecast games at the bottom. */
export function sortMatchups(games: BBGame[], sort: MatchupSort): BBGame[] {
  return games
    .map((game, index) => ({ game, index }))
    .sort((a, b) => {
      const ap = a.game.prediction || a.game.fallback_prediction;
      const bp = b.game.prediction || b.game.fallback_prediction;
      if (sort !== "date" && (ap != null) !== (bp != null)) {
        return ap != null ? -1 : 1;
      }
      let result = 0;
      if (sort === "date") {
        result = a.game.starts_at.localeCompare(b.game.starts_at);
      } else if (ap && bp) {
        if (sort === "confidence") {
          result = compareNumber(
            forecastSignal(ap).confidence,
            forecastSignal(bp).confidence,
            true,
          );
        } else if (sort === "close") {
          result = compareNumber(
            Math.abs(ap.home_margin),
            Math.abs(bp.home_margin),
            false,
          );
        } else if (sort === "margin") {
          result = compareNumber(
            Math.abs(ap.home_margin),
            Math.abs(bp.home_margin),
            true,
          );
        } else if (sort === "uncertainty") {
          result = compareNumber(
            ap.margin_high - ap.margin_low,
            bp.margin_high - bp.margin_low,
            true,
          );
        }
      }
      return (
        result ||
        a.game.starts_at.localeCompare(b.game.starts_at) ||
        a.index - b.index
      );
    })
    .map(({ game }) => game);
}
