import type { BBGame } from "./basketball-types";
import type { Comparison } from "./research-types";

export type LiveForecastRow = {
  game_id: string;
  model_id?: string;
  created_at?: string;
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
  source_start?: string | null;
  source_time_valid?: boolean | null;
  source_observed_at?: string | null;
  prediction: BBGame["prediction"];
};

type LiveForecastPage = {
  total: number;
  page_size: number;
  rows: LiveForecastRow[];
};

type LiveScorecardResponse = {
  games: Array<{ game_id: string; comparisons?: Comparison[] }>;
};

const RETRY_DELAYS_MS = [150, 500] as const;

function retryDelay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      const error = new Error("The live request was aborted.");
      error.name = "AbortError";
      reject(error);
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchWithTransientRetry(url: string, signal?: AbortSignal) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const requestUrl = attempt === 0
      ? url
      : `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}`;
    const response = await fetch(requestUrl, { signal });
    if (response.ok) return response;
    const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
    if (!retryable || attempt === RETRY_DELAYS_MS.length) return response;
    await retryDelay(RETRY_DELAYS_MS[attempt], signal);
  }
  throw new Error("Live request retry loop ended unexpectedly.");
}

export async function loadLiveBasketballForecasts(
  signal?: AbortSignal,
  options: { maxPages?: number; model?: string; query?: string } = {},
) {
  const modelQuery =
    options.model && options.model !== "latest"
      ? `&model=${encodeURIComponent(options.model)}`
      : "";
  const searchQuery = options.query?.trim()
    ? `&q=${encodeURIComponent(options.query.trim())}`
    : "";
  const firstResponse = await fetchWithTransientRetry(
    `/api/basketball/research/forecasts?season=2027&status=upcoming&limit=100&page=0${modelQuery}${searchQuery}`,
    signal,
  );
  if (!firstResponse.ok) throw new Error("Live matchup forecasts unavailable.");
  const first = await firstResponse.json() as LiveForecastPage;
  const pageCount = Math.ceil(first.total / Math.max(first.page_size, 1));
  const pagesToFetch = options.maxPages == null
    ? pageCount
    : Math.min(pageCount, Math.max(1, Math.floor(options.maxPages)));
  const additional = await Promise.all(
    Array.from({ length: Math.max(0, pagesToFetch - 1) }, (_, index) =>
      fetchWithTransientRetry(
        `/api/basketball/research/forecasts?season=2027&status=upcoming&limit=100&page=${index + 1}${modelQuery}${searchQuery}`,
        signal,
      ).then((response) => {
        if (!response.ok) throw new Error("Live matchup forecasts unavailable.");
        return response.json() as Promise<LiveForecastPage>;
      }),
    ),
  );
  return [first, ...additional].flatMap((page) => page.rows);
}

export async function loadLiveBasketballMarketComparisons(signal?: AbortSignal) {
  const response = await fetchWithTransientRetry(
    "/api/research/scorecard?sport=basketball&limit=5000",
    signal,
  );
  if (!response.ok) throw new Error("Live market comparisons unavailable.");
  const payload = await response.json() as LiveScorecardResponse;
  return Object.fromEntries(
    (payload.games || []).map((game) => [game.game_id, game.comparisons || []]),
  ) as Record<string, Comparison[]>;
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
      source_start: row.source_start ?? base?.source_start ?? null,
      source_time_valid: row.source_time_valid ?? base?.source_time_valid ?? null,
      source_observed_at: row.source_observed_at ?? base?.source_observed_at ?? null,
      prediction: row.prediction,
    } satisfies BBGame];
  });
  return [...merged, ...games.filter((game) => !liveIds.has(game.id))].sort(
    (a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id),
  );
}

/** Fetch one forecast by immutable game ID for small, auditable live slates. */
export async function fetchLiveForecast(
  gameId: string,
  signal?: AbortSignal,
): Promise<LiveForecastRow | null> {
  const params = new URLSearchParams({
    season: "2027",
    gameId,
    status: "all",
    model: "latest",
    limit: "1",
  });
  const response = await fetchWithTransientRetry(`/api/basketball/research/forecasts?${params}`, signal);
  if (!response.ok) throw new Error("Live basketball forecast unavailable.");
  const payload = await response.json() as { rows?: LiveForecastRow[] };
  return payload.rows?.find((row) => row.game_id === gameId) || null;
}

export function mergeLiveForecast(game: BBGame, row: LiveForecastRow | null): BBGame {
  if (!row || row.game_id !== game.id || !row.home_name || !row.away_name) return game;
  return {
    ...game,
    starts_at: row.starts_at,
    home_id: row.home_id,
    away_id: row.away_id,
    home_name: row.home_name,
    away_name: row.away_name,
    neutral: row.neutral,
    time_tbd: row.time_tbd,
    venue: row.venue || game.venue,
    broadcast: row.broadcast || game.broadcast,
    source_start: row.source_start ?? game.source_start ?? null,
    source_time_valid: row.source_time_valid ?? game.source_time_valid ?? null,
    source_observed_at: row.source_observed_at ?? game.source_observed_at ?? null,
    prediction: row.prediction,
  } satisfies BBGame;
}
