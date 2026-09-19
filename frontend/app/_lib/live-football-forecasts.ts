import type { Forecast, Game } from "./data";
import type { Comparison } from "./research-types";

export type LiveFootballForecastRow = {
  game_id: string;
  model_id?: string;
  kickoff: string;
  home_id: string;
  away_id: string;
  home_name: string;
  away_name: string;
  home_margin: number | null;
  total: number | null;
  home_win_probability: number | null;
  home_score: number | null;
  away_score: number | null;
  margin_low: number | null;
  margin_high: number | null;
};

type LiveFootballForecastPage = {
  total: number;
  page_size: number;
  rows: LiveFootballForecastRow[];
};

type LiveFootballScorecardResponse = {
  games?: Array<{ game_id: string; comparisons?: Comparison[] }>;
};

export async function loadLiveFootballForecasts(
  signal?: AbortSignal,
  options: { maxPages?: number; cacheBust?: string } = {},
) {
  const cohort = encodeURIComponent(options.cacheBust || String(Date.now()));
  const firstResponse = await fetch(
    `/api/football/research/forecasts?season=2026&status=upcoming&limit=100&page=0&cohort=${cohort}`,
    { signal },
  );
  if (!firstResponse.ok) throw new Error("Live football forecasts unavailable.");
  const first = await firstResponse.json() as LiveFootballForecastPage;
  const total = Number(first.total);
  const pageSize = Number(first.page_size);
  if (!Number.isInteger(total) || total < 0 || !Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("Live football forecasts returned invalid pagination metadata.");
  }
  if (!Array.isArray(first.rows) || first.rows.length > pageSize || (total > 0 && first.rows.length === 0)) {
    throw new Error("Live football forecasts returned an incomplete page.");
  }
  const firstModelIds = new Set(first.rows.map((row) => row.model_id).filter((value): value is string => Boolean(value)));
  if (first.rows.length > 0 && firstModelIds.size !== 1) {
    throw new Error("Live football forecasts did not identify one model edition.");
  }
  const resolvedModelId = [...firstModelIds][0];
  const modelQuery = resolvedModelId ? `&model=${encodeURIComponent(resolvedModelId)}` : "";
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pagesToFetch = options.maxPages == null
    ? pageCount
    : Math.min(pageCount, Math.max(1, Math.floor(options.maxPages)));
  if (pagesToFetch > 1001) throw new Error("The live football forecast cohort exceeds the bounded page window.");
  const additional = await Promise.all(
    Array.from({ length: Math.max(0, pagesToFetch - 1) }, (_, index) =>
      fetch(
        `/api/football/research/forecasts?season=2026&status=upcoming&limit=100&page=${index + 1}${modelQuery}&cohort=${cohort}`,
        { signal },
      ).then((response) => {
        if (!response.ok) throw new Error("Live football forecasts unavailable.");
        return response.json() as Promise<LiveFootballForecastPage>;
      }),
    ),
  );
  const pages = [first, ...additional];
  pages.forEach((payload, page) => {
    if (Number(payload.total) !== total || Number(payload.page_size) !== pageSize || !Array.isArray(payload.rows) || payload.rows.length > pageSize) {
      throw new Error("Live football forecasts changed during pagination.");
    }
    if (page < pagesToFetch - 1 && payload.rows.length === 0) {
      throw new Error("Live football forecasts returned an incomplete page.");
    }
    if (resolvedModelId && payload.rows.some((row) => row.model_id !== resolvedModelId)) {
      throw new Error("Live football forecasts mixed model editions.");
    }
  });
  const rows = pages.flatMap((page) => page.rows);
  if (pagesToFetch === pageCount && rows.length !== total) {
    throw new Error("Live football forecasts returned an incomplete cohort.");
  }
  const ids = new Set(rows.map((row) => row.game_id));
  if (ids.size !== rows.length) throw new Error("Live football forecasts returned duplicate games.");
  return rows;
}

/** Load only exact, ledger-qualified market comparisons for football games. */
export async function loadLiveFootballMarketComparisons(signal?: AbortSignal) {
  const response = await fetch(
    "/api/research/scorecard?sport=football&limit=5000",
    { signal },
  );
  if (!response.ok) throw new Error("Live football market comparisons unavailable.");
  const payload = await response.json() as LiveFootballScorecardResponse;
  return Object.fromEntries(
    (payload.games || []).map((game) => [game.game_id, game.comparisons || []]),
  ) as Record<string, Comparison[]>;
}

export function mergeLiveFootballForecasts(games: Game[], rows: LiveFootballForecastRow[]) {
  const liveById = new Map(rows.map((row) => [row.game_id, row]));
  return games.map((game) => {
    const live = liveById.get(game.id);
    if (!live) return game;
    const completeLivePrediction = live.home_margin !== null
      && live.total !== null
      && live.home_win_probability !== null
      && live.home_score !== null
      && live.away_score !== null
      && live.margin_low !== null
      && live.margin_high !== null;
    if (!game.prediction && !completeLivePrediction) return game;
    const prediction: Forecast = {
      ...(game.prediction || {
        home_margin: live.home_margin!,
        total: live.total!,
        home_win_probability: live.home_win_probability!,
        home_score: live.home_score!,
        away_score: live.away_score!,
        margin_low: live.margin_low!,
        margin_high: live.margin_high!,
      }),
      home_margin: live.home_margin ?? game.prediction!.home_margin,
      total: live.total ?? game.prediction!.total,
      home_win_probability: live.home_win_probability ?? game.prediction!.home_win_probability,
      home_score: live.home_score ?? game.prediction!.home_score,
      away_score: live.away_score ?? game.prediction!.away_score,
      margin_low: live.margin_low ?? game.prediction!.margin_low,
      margin_high: live.margin_high ?? game.prediction!.margin_high,
    };
    return {
      ...game,
      kickoff: live.kickoff,
      home_id: live.home_id,
      away_id: live.away_id,
      home_name: live.home_name,
      away_name: live.away_name,
      prediction,
    };
  });
}
