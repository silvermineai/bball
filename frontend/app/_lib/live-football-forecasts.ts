import type { Forecast, Game } from "./data";
import type { Comparison } from "./research-types";

export type LiveFootballForecastRow = {
  game_id: string;
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
  options: { maxPages?: number } = {},
) {
  const firstResponse = await fetch(
    "/api/football/research/forecasts?season=2026&status=upcoming&limit=100&page=0",
    { signal },
  );
  if (!firstResponse.ok) throw new Error("Live football forecasts unavailable.");
  const first = await firstResponse.json() as LiveFootballForecastPage;
  const pageCount = Math.ceil(first.total / Math.max(first.page_size, 1));
  const pagesToFetch = options.maxPages == null
    ? pageCount
    : Math.min(pageCount, Math.max(1, Math.floor(options.maxPages)));
  const additional = await Promise.all(
    Array.from({ length: Math.max(0, pagesToFetch - 1) }, (_, index) =>
      fetch(
        `/api/football/research/forecasts?season=2026&status=upcoming&limit=100&page=${index + 1}`,
        { signal },
      ).then((response) => {
        if (!response.ok) throw new Error("Live football forecasts unavailable.");
        return response.json() as Promise<LiveFootballForecastPage>;
      }),
    ),
  );
  return [first, ...additional].flatMap((page) => page.rows);
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
