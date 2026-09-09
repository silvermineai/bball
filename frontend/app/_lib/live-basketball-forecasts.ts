import type { BBGame } from "./basketball-types";

export type LiveForecastRow = {
  game_id: string;
  season: number;
  starts_at: string;
  home_id: string;
  away_id: string;
  home_name: string | null;
  away_name: string | null;
  neutral: number;
  time_tbd: number;
  venue: string | null;
  broadcast: string | null;
  prediction: BBGame["prediction"];
};

type LiveForecastPage = {
  total: number;
  page_size: number;
  rows: LiveForecastRow[];
};

export async function loadLiveBasketballForecasts(signal?: AbortSignal) {
  const firstResponse = await fetch(
    "/api/basketball/research/forecasts?season=2027&status=upcoming&limit=100&page=0",
    { signal },
  );
  if (!firstResponse.ok) throw new Error("Live matchup forecasts unavailable.");
  const first = await firstResponse.json() as LiveForecastPage;
  const pageCount = Math.ceil(first.total / Math.max(first.page_size, 1));
  const additional = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      fetch(
        `/api/basketball/research/forecasts?season=2027&status=upcoming&limit=100&page=${index + 1}`,
        { signal },
      ).then((response) => {
        if (!response.ok) throw new Error("Live matchup forecasts unavailable.");
        return response.json() as Promise<LiveForecastPage>;
      }),
    ),
  );
  return [first, ...additional].flatMap((page) => page.rows);
}

export function mergeLiveBasketballForecasts(games: BBGame[], rows: LiveForecastRow[]) {
  const staticById = new Map(games.map((game) => [game.id, game]));
  const liveIds = new Set<string>();
  const merged = rows.flatMap((row) => {
    const base = staticById.get(row.game_id);
    const names = row.home_name && row.away_name
      ? { home_name: row.home_name, away_name: row.away_name }
      : base
        ? { home_name: base.home_name, away_name: base.away_name }
        : null;
    if (!names) return [];
    liveIds.add(row.game_id);
    return [{
      ...(base || {
        id: row.game_id,
        season: row.season,
        home_id: row.home_id,
        away_id: row.away_id,
        neutral: row.neutral,
        time_tbd: row.time_tbd,
        venue: row.venue || "",
        broadcast: row.broadcast || "",
        prediction: null,
      }),
      starts_at: row.starts_at,
      home_id: row.home_id,
      away_id: row.away_id,
      home_name: names.home_name,
      away_name: names.away_name,
      neutral: row.neutral,
      time_tbd: row.time_tbd,
      venue: row.venue || base?.venue || "",
      broadcast: row.broadcast || base?.broadcast || "",
      prediction: row.prediction,
    } satisfies BBGame];
  });
  return [...merged, ...games.filter((game) => !liveIds.has(game.id))].sort(
    (a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id),
  );
}
