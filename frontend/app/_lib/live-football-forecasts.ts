import type { Forecast, Game } from "./data";

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
};

type LiveFootballForecastPage = {
  total: number;
  page_size: number;
  rows: LiveFootballForecastRow[];
};

export async function loadLiveFootballForecasts(signal?: AbortSignal) {
  const firstResponse = await fetch(
    "/api/football/research/forecasts?season=2026&status=upcoming&limit=100&page=0",
    { signal },
  );
  if (!firstResponse.ok) throw new Error("Live football forecasts unavailable.");
  const first = await firstResponse.json() as LiveFootballForecastPage;
  const pageCount = Math.ceil(first.total / Math.max(first.page_size, 1));
  const additional = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
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

export function mergeLiveFootballForecasts(games: Game[], rows: LiveFootballForecastRow[]) {
  const liveById = new Map(rows.map((row) => [row.game_id, row]));
  return games.map((game) => {
    const live = liveById.get(game.id);
    if (!live || !game.prediction) return game;
    const prediction: Forecast = {
      ...game.prediction,
      home_margin: live.home_margin ?? game.prediction.home_margin,
      total: live.total ?? game.prediction.total,
      home_win_probability: live.home_win_probability ?? game.prediction.home_win_probability,
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
