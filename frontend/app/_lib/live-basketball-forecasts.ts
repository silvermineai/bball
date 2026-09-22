import type { BBGame, BBRosterScenario } from "./basketball-types";
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
  /** Server-side readiness read over prediction and same-edition context. */
  analysis_readiness?: BBGame["analysis_readiness"];
  /** Four Factor context validated by the forecast endpoint. */
  matchup_factors?: BBGame["matchup_factors"];
  /** Edition that produced the attached Four Factor context. */
  matchup_factors_model_id?: string | null;
};

type LiveForecastPage = {
  total: number;
  page_size: number;
  rows: LiveForecastRow[];
};

type LiveScorecardResponse = {
  games: Array<{ game_id: string; model_id?: string | null; comparisons?: Comparison[] }>;
};

export type LiveGameMarketComparison = {
  modelId: string;
  forecastCreatedAt: string | null;
  forecastStartsAt: string | null;
  comparisons: Comparison[];
};

export type LiveMarketComparisonStatus = "checking_forecast" | "checking_market" | "ready" | "unavailable";

/**
 * Return market evidence only when the journal game carries the same
 * immutable forecast edition used to build the comparison map. A partial
 * live forecast refresh must not attach current-edition quotes to a static
 * game row that was not hydrated.
 */
export function exactBasketballMarketComparisons(
  game: Pick<BBGame, "id" | "forecast_model_id">,
  markets: Record<string, Comparison[]>,
  modelId: string | null | undefined,
) {
  if (!modelId || game.forecast_model_id !== modelId) return [] as Comparison[];
  return markets[game.id] || [];
}

/** Keep an empty market map from being presented as a completed zero-quote read. */
export function liveMarketComparisonStatus(args: {
  modelId: string | null;
  forecastReady: boolean;
  forecastError?: string;
  marketError?: string;
  comparisons: Record<string, Comparison[]> | null;
}): LiveMarketComparisonStatus {
  if (args.marketError || args.forecastError || (args.forecastReady && !args.modelId)) return "unavailable";
  if (args.comparisons) return "ready";
  return args.forecastReady ? "checking_market" : "checking_forecast";
}

/** Resolve one immutable forecast edition before attaching market evidence. */
export function forecastModelId(rows: Pick<LiveForecastRow, "model_id">[]) {
  const ids = new Set(rows.map((row) => row.model_id).filter((value): value is string => Boolean(value)));
  return ids.size === 1 ? [...ids][0] : null;
}

export function publishedBasketballPrediction(
  game: Pick<BBGame, "prediction" | "fallback_prediction">,
): NonNullable<BBGame["prediction"]> | null {
  return game.prediction || game.fallback_prediction || null;
}

/**
 * Return a roster scenario only when it was calibrated against the exact
 * primary forecast edition on the game. Static games use the explicitly
 * supplied published edition; live-hydrated games carry their D1 edition.
 */
export function matchingRosterScenario(
  game: Pick<BBGame, "forecast_model_id">,
  scenario: BBRosterScenario | null | undefined,
  publishedModelId: string,
) {
  const forecastModelId = game.forecast_model_id || publishedModelId;
  return scenario?.primary_model_id === forecastModelId ? scenario : null;
}

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

export async function fetchWithTransientRetry(url: string, signal?: AbortSignal) {
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
  options: { maxPages?: number; model?: string; query?: string; cacheBust?: string } = {},
) {
  let modelQuery =
    options.model && options.model !== "latest"
      ? `&model=${encodeURIComponent(options.model)}`
      : "";
  const searchQuery = options.query?.trim()
    ? `&q=${encodeURIComponent(options.query.trim())}`
    : "";
  // Each page is independently edge-cached. A cohort key prevents page 0 and
  // later pages from mixing two adjacent model editions during a refresh.
  const cohortQuery = `&cohort=${encodeURIComponent(options.cacheBust || String(Date.now()))}`;
  const firstResponse = await fetchWithTransientRetry(
    `/api/basketball/research/forecasts?season=2027&status=upcoming&limit=100&page=0${modelQuery}${searchQuery}${cohortQuery}`,
    signal,
  );
  if (!firstResponse.ok) throw new Error("Live matchup forecasts unavailable.");
  const first = await firstResponse.json() as LiveForecastPage;
  const pageTotal = Number(first.total);
  const pageSize = Number(first.page_size);
  if (!Number.isInteger(pageTotal) || pageTotal < 0 || !Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("Live matchup forecasts returned invalid pagination metadata.");
  }
  if (!Array.isArray(first.rows) || first.rows.length > pageSize || (pageTotal > 0 && first.rows.length === 0)) {
    throw new Error("Live matchup forecasts returned an incomplete page.");
  }
  const firstModelIds = new Set(first.rows.map((row) => row.model_id).filter((value): value is string => Boolean(value)));
  if (firstModelIds.size > 1) throw new Error("Live matchup forecasts mixed model editions.");
  const resolvedModelId = [...firstModelIds][0];
  if (resolvedModelId && (!options.model || options.model === "latest")) {
    // Pin all later requests to the edition page 0 actually returned. This
    // prevents different D1 replicas from resolving `latest` differently.
    modelQuery = `&model=${encodeURIComponent(resolvedModelId)}`;
  }
  const pageCount = Math.max(1, Math.ceil(pageTotal / pageSize));
  const pagesToFetch = options.maxPages == null
    ? pageCount
    : Math.min(pageCount, Math.max(1, Math.floor(options.maxPages)));
  if (pagesToFetch > 1001) throw new Error("The live forecast cohort exceeds the bounded page window.");
  const additional = await Promise.all(
    Array.from({ length: Math.max(0, pagesToFetch - 1) }, (_, index) =>
      fetchWithTransientRetry(
        `/api/basketball/research/forecasts?season=2027&status=upcoming&limit=100&page=${index + 1}${modelQuery}${searchQuery}${cohortQuery}`,
        signal,
      ).then(async (response) => {
        if (!response.ok) throw new Error("Live matchup forecasts unavailable.");
        return await response.json() as LiveForecastPage;
      }),
    ),
  );
  const pages = [first, ...additional];
  pages.forEach((payload, page) => {
    const payloadTotal = Number(payload.total);
    const payloadSize = Number(payload.page_size);
    if (payloadTotal !== pageTotal || payloadSize !== pageSize || !Array.isArray(payload.rows) || payload.rows.length > pageSize) {
      throw new Error("Live matchup forecasts changed during pagination.");
    }
    if (page < pagesToFetch - 1 && payload.rows.length === 0) {
      throw new Error("Live matchup forecasts returned an incomplete page.");
    }
    if (resolvedModelId && payload.rows.some((row) => row.model_id && row.model_id !== resolvedModelId)) {
      throw new Error("Live matchup forecasts mixed model editions.");
    }
  });
  const rows = pages.flatMap((page) => page.rows);
  if (pagesToFetch === pageCount && rows.length !== pageTotal) {
    throw new Error("Live matchup forecasts returned an incomplete cohort.");
  }
  const ids = new Set(rows.map((row) => row.game_id));
  if (ids.size !== rows.length) throw new Error("Live matchup forecasts returned duplicate games.");
  const cohortModelIds = new Set(rows.map((row) => row.model_id).filter((value): value is string => Boolean(value)));
  if (cohortModelIds.size > 1) throw new Error("Live matchup forecasts mixed model editions.");
  if (rows.length > 0 && rows.some((row) => !row.model_id)) {
    throw new Error("Live matchup forecasts returned an unlabeled model edition.");
  }
  return rows;
}

export async function loadLiveBasketballMarketComparisons(
  signal: AbortSignal | undefined,
  modelId: string | null | undefined,
) {
  // Market lines are only useful beside the exact forecast edition that
  // produced the prediction. An absent edition is an honest empty result.
  if (!modelId) return {} as Record<string, Comparison[]>;
  const response = await fetchWithTransientRetry(
    `/api/research/scorecard?sport=basketball&model=${encodeURIComponent(modelId)}&limit=5000`,
    signal,
  );
  if (!response.ok) throw new Error("Live market comparisons unavailable.");
  const payload = await response.json() as LiveScorecardResponse;
  return Object.fromEntries(
    (payload.games || [])
      .filter((game) => game.model_id === modelId)
      .map((game) => [game.game_id, game.comparisons || []]),
  ) as Record<string, Comparison[]>;
}

/**
 * Load the current market evidence for one brief without mixing forecast
 * editions. The forecast lookup is intentionally exact-game and the
 * scorecard row must repeat the same immutable model ID before comparisons
 * are returned.
 */
export async function loadLiveBasketballGameMarketComparison(
  signal: AbortSignal | undefined,
  gameId: string,
): Promise<LiveGameMarketComparison | null> {
  const forecastResponse = await fetchWithTransientRetry(
    `/api/basketball/research/forecasts?season=2027&gameId=${encodeURIComponent(gameId)}&model=latest&status=all&limit=1`,
    signal,
  );
  if (!forecastResponse.ok) throw new Error("Live matchup forecast unavailable.");
  const forecastPayload = await forecastResponse.json() as { rows?: LiveForecastRow[] };
  const forecast = forecastPayload.rows?.find((row) => row.game_id === gameId);
  if (!forecast?.model_id) return null;

  const scorecardResponse = await fetchWithTransientRetry(
    `/api/research/scorecard?sport=basketball&model=${encodeURIComponent(forecast.model_id)}&limit=5000`,
    signal,
  );
  if (!scorecardResponse.ok) throw new Error("Live market comparisons unavailable.");
  const scorecard = await scorecardResponse.json() as LiveScorecardResponse;
  const game = (scorecard.games || []).find(
    (row) => row.game_id === gameId && row.model_id === forecast.model_id,
  );
  return {
    modelId: forecast.model_id,
    forecastCreatedAt: forecast.created_at || null,
    forecastStartsAt: forecast.starts_at || null,
    comparisons: game?.comparisons || [],
  };
}

export function mergeLiveBasketballForecasts(
  games: BBGame[],
  rows: LiveForecastRow[],
  staticModelId?: string | null,
) {
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
    const coldStart = row.prediction?.estimate_type === "cold_start";
    // Factor context is descriptive model evidence. Keep its producing
    // edition attached so the UI can show useful context without presenting
    // an older context asset as if it generated the newer prediction.
    const factorModelId = row.matchup_factors_model_id || null;
    const liveFactors = row.matchup_factors ?? null;
    const staticFactors = base
      && staticModelId
      && (base.forecast_model_id || staticModelId) === row.model_id
      ? base.matchup_factors ?? null
      : null;
    const factors = liveFactors || staticFactors;
    const factorsModelId = liveFactors
      ? factorModelId
      : staticFactors
        ? staticModelId || base?.forecast_model_id || null
        : null;
    // A market comparison is useful only beside the exact forecast edition
    // that produced the prediction. A live refresh can replace the static
    // forecast while the scorecard request is still pending (or unavailable),
    // so never carry a quote from an older edition into the new row.
    const staticMarketComparisons = base
      && row.model_id
      && (base.forecast_model_id || staticModelId) === row.model_id
      ? base.market_comparisons
      : [];
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
      forecast_model_id: row.model_id || base?.forecast_model_id || null,
      forecast_created_at: row.created_at ?? base?.forecast_created_at ?? null,
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
      matchup_factors: factors,
      analysis_readiness: row.analysis_readiness ?? base?.analysis_readiness ?? null,
      matchup_factors_model_id: factorsModelId,
      matchup_factors_generated_at: liveFactors
        ? row.created_at ?? null
        : staticFactors
          ? base?.forecast_created_at ?? null
          : null,
      matchup_factors_same_edition: factors
        ? Boolean(factorsModelId && row.model_id && factorsModelId === row.model_id)
        : null,
      market_comparisons: staticMarketComparisons,
      // The API stores one row per game, including cold-start estimates. Keep
      // the distinction used by the static release so cards and filters do
      // not promote an exploratory estimate to the primary model field.
      prediction: coldStart ? base?.prediction ?? null : row.prediction,
      fallback_prediction: coldStart ? row.prediction : base?.fallback_prediction ?? null,
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
  const coldStart = row.prediction?.estimate_type === "cold_start";
  // Featured cards are hydrated one game at a time, so apply the same
  // edition lineage gate used by the full slate. A static factor set without
  // an exact producing edition must not survive beside a newer live forecast.
  const liveFactors = row.matchup_factors ?? null;
  const staticFactors = !liveFactors
    && game.matchup_factors
    && game.matchup_factors_model_id === row.model_id
    ? game.matchup_factors
    : null;
  const factors = liveFactors || staticFactors;
  const factorsModelId = liveFactors
    ? row.matchup_factors_model_id || null
    : staticFactors
      ? game.matchup_factors_model_id || null
      : null;
  const staticMarketComparisons = game.forecast_model_id && row.model_id
    && game.forecast_model_id === row.model_id
    ? game.market_comparisons
    : [];
  return {
    ...game,
    forecast_model_id: row.model_id || game.forecast_model_id || null,
    forecast_created_at: row.created_at ?? game.forecast_created_at ?? null,
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
    matchup_factors: factors,
    analysis_readiness: row.analysis_readiness ?? game.analysis_readiness ?? null,
    matchup_factors_model_id: factorsModelId,
    matchup_factors_generated_at: liveFactors
      ? row.created_at ?? null
      : staticFactors
        ? game.matchup_factors_generated_at ?? null
        : null,
    matchup_factors_same_edition: factors
      ? Boolean(factorsModelId && row.model_id && factorsModelId === row.model_id)
      : null,
    market_comparisons: staticMarketComparisons,
    prediction: coldStart ? game.prediction : row.prediction,
    fallback_prediction: coldStart ? row.prediction : game.fallback_prediction ?? null,
  } satisfies BBGame;
}
