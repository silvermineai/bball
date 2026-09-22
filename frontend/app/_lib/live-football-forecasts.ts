import type { Forecast, Game } from "./data";
import type { Comparison, LedgerGame } from "./research-types";
import type { FootballReliabilityBand } from "./football-model-factors";
import { validFootballPredictionArithmetic } from "./football-prediction-integrity";

export type LiveFootballForecastRow = {
  game_id: string;
  model_id?: string;
  created_at?: string;
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
  prediction_integrity?: "valid" | "invalid" | "unavailable";
};

type LiveFootballForecastPage = {
  total: number;
  page_size: number;
  rows: LiveFootballForecastRow[];
};

type LiveFootballModelCatalog = {
  models?: Array<{
    model_id?: string;
    model_summary?: {
      evaluation?: {
        reliability?: FootballReliabilityBand[];
      };
    };
  }>;
};

export type LiveFootballModelReliability = {
  modelId: string;
  reliability: FootballReliabilityBand[] | null;
};

function finiteOrNull(value: unknown) {
  return value === null || value === undefined || (typeof value === "number" && Number.isFinite(value));
}

/** Keep malformed live scalars from overwriting a source-linked static card. */
export function validLiveFootballForecast(row: LiveFootballForecastRow) {
  const numeric = [
    row.home_margin,
    row.total,
    row.home_win_probability,
    row.home_score,
    row.away_score,
    row.margin_low,
    row.margin_high,
  ];
  if (!numeric.every(finiteOrNull)) return false;
  if (row.home_win_probability != null && (row.home_win_probability < 0 || row.home_win_probability > 1)) return false;
  if (row.total != null && row.total < 0) return false;
  if (!validFootballPredictionArithmetic(row)) return false;
  if (row.margin_low != null && row.margin_high != null && row.margin_low > row.margin_high) return false;
  if (row.home_margin != null && row.margin_low != null && row.margin_high != null
    && (row.home_margin < row.margin_low || row.home_margin > row.margin_high)) return false;
  return row.prediction_integrity !== "invalid";
}

/**
 * Keep held-out reliability attached to the exact live forecast edition. A
 * static reliability artifact belongs to its own model ID and cannot explain
 * a newer live row just because the probability bands look compatible.
 */
export function exactLiveFootballReliability(
  catalog: LiveFootballModelCatalog,
  modelId: string,
): LiveFootballModelReliability {
  const model = catalog.models?.find((candidate) => candidate.model_id === modelId);
  const reliability = model?.model_summary?.evaluation?.reliability;
  return {
    modelId,
    reliability: Array.isArray(reliability) ? reliability : null,
  };
}

/** Load the active model's own held-out reliability bins from the Worker. */
export async function loadLiveFootballModelReliability(
  signal: AbortSignal | undefined,
  modelId: string,
): Promise<LiveFootballModelReliability> {
  const response = await fetch("/api/football/research/forecasts?season=2026&meta=1", { signal });
  if (!response.ok) throw new Error("Live football model calibration unavailable.");
  const payload = await response.json() as LiveFootballModelCatalog;
  if (!Array.isArray(payload.models)) throw new Error("Live football model catalog is incomplete.");
  const result = exactLiveFootballReliability(payload, modelId);
  if (!payload.models.some((candidate) => candidate.model_id === modelId)) {
    throw new Error("Live football model calibration has no matching edition.");
  }
  return result;
}

type LiveFootballScorecardResponse = {
  live?: boolean;
  season?: number | null;
  model?: string | null;
  total?: number;
  page_size?: number;
  games?: Array<{ game_id: string; model_id?: string; comparisons?: Comparison[]; market_readiness?: LedgerGame["market_readiness"] }>;
};

export type LiveFootballMarketComparisonSet = {
  model_id?: string;
  comparisons: Comparison[];
  market_readiness?: LedgerGame["market_readiness"];
};

export type LiveFootballGameMarketComparison = {
  modelId: string;
  forecastCreatedAt: string | null;
  forecastStartsAt: string | null;
  comparisons: Comparison[];
  marketReadiness?: LedgerGame["market_readiness"];
};

/**
 * Load one football game's current forecast and its exact scorecard row.
 *
 * Matchup notebooks are server-rendered from a bundled edition, while the
 * active model and market ledger can advance between builds. Resolve the
 * forecast first, then ask the scorecard for that same game and model ID so a
 * quote from another edition cannot appear beside the notebook estimate.
 */
export async function loadLiveFootballGameMarketComparison(
  signal: AbortSignal | undefined,
  gameId: string,
): Promise<LiveFootballGameMarketComparison | null> {
  const encodedGameId = encodeURIComponent(gameId);
  const forecastResponse = await fetch(
    `/api/football/research/forecasts?season=2026&gameId=${encodedGameId}&model=latest&status=all&limit=1`,
    { signal },
  );
  if (!forecastResponse.ok) throw new Error("Live football forecast unavailable.");
  const forecastPayload = await forecastResponse.json() as { rows?: LiveFootballForecastRow[] };
  const forecast = forecastPayload.rows?.find((row) => row.game_id === gameId);
  if (!forecast?.model_id || !validLiveFootballForecast(forecast)) return null;

  const scorecardResponse = await fetch(
    `/api/research/scorecard?sport=football&season=2026&gameId=${encodedGameId}&model=${encodeURIComponent(forecast.model_id)}&limit=5000`,
    { signal },
  );
  if (!scorecardResponse.ok) throw new Error("Live football market comparisons unavailable.");
  const scorecard = await scorecardResponse.json() as {
    live?: boolean;
    season?: number | null;
    model?: string | null;
    games?: Array<{ game_id: string; model_id?: string; comparisons?: Comparison[]; market_readiness?: LedgerGame["market_readiness"] }>;
  };
  if (scorecard.live !== true || scorecard.season !== 2026 || scorecard.model !== forecast.model_id) {
    throw new Error("Live football market comparisons returned an inconsistent edition.");
  }
  const game = (scorecard.games || []).find(
    (row) => row.game_id === gameId && row.model_id === forecast.model_id,
  );
  return {
    modelId: forecast.model_id,
    forecastCreatedAt: forecast.created_at || null,
    forecastStartsAt: forecast.kickoff || null,
    comparisons: game?.comparisons || [],
    marketReadiness: game?.market_readiness,
  };
}

/**
 * Keep the landing board useful while its live scorecard request is in flight
 * or unavailable. Once a complete live map exists, an empty entry is
 * authoritative and must clear any older static comparison.
 */
export function dashboardFootballMarketComparisons(
  game: Game,
  liveComparisons: Record<string, Comparison[]> | null,
): Comparison[] {
  if (liveComparisons === null) return game.market_comparisons || [];
  return liveComparisons[game.id] || [];
}

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
  if (first.rows.some((row) => !row.model_id || !validLiveFootballForecast(row))) {
    throw new Error("Live football forecasts returned invalid prediction values.");
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
    if (payload.rows.some((row) => !row.model_id || !validLiveFootballForecast(row))) {
      throw new Error("Live football forecasts returned invalid prediction values.");
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
export async function loadLiveFootballMarketComparisons(signal: AbortSignal | undefined, modelId: string) {
  if (!modelId) throw new Error("Live football market comparisons require a model edition.");
  const endpoint = (page: number) =>
    `/api/research/scorecard?sport=football&season=2026&model=${encodeURIComponent(modelId)}&limit=5000&page=${page}`;
  const fetchPage = async (page: number) => {
    const response = await fetch(endpoint(page), { signal });
    if (!response.ok) throw new Error("Live football market comparisons unavailable.");
    return response.json() as Promise<LiveFootballScorecardResponse>;
  };
  const first = await fetchPage(0);
  const total = Number(first.total);
  const pageSize = Number(first.page_size);
  if (first.live !== true || first.season !== 2026 || first.model !== modelId || !Number.isInteger(total) || total < 0
    || !Number.isInteger(pageSize) || pageSize < 1 || !Array.isArray(first.games) || first.games.length > pageSize) {
    throw new Error("Live football market comparisons returned an incomplete cohort.");
  }
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Keep pagination bounded if an upstream response advertises corrupt metadata.
  if (pageCount > 1001) throw new Error("The live football market cohort exceeds the bounded page window.");
  const additional = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) => fetchPage(index + 1)),
  );
  const pages = [first, ...additional];
  pages.forEach((payload, page) => {
    if (payload.live !== true || payload.season !== 2026 || payload.model !== modelId
      || Number(payload.total) !== total || Number(payload.page_size) !== pageSize
      || !Array.isArray(payload.games) || payload.games.length > pageSize
      || (page < pageCount - 1 && payload.games.length === 0)) {
      throw new Error("Live football market comparisons returned an incomplete cohort.");
    }
  });
  const games = pages.flatMap((payload) => payload.games || []);
  if (games.length !== total) throw new Error("Live football market comparisons returned an incomplete cohort.");
  const ids = new Set(games.map((game) => game.game_id));
  if (ids.size !== games.length) {
    throw new Error("Live football market comparisons returned duplicate games.");
  }
  return Object.fromEntries(
    games.map((game) => [game.game_id, {
      model_id: game.model_id,
      comparisons: game.comparisons || [],
      market_readiness: game.market_readiness,
    }]),
  ) as Record<string, LiveFootballMarketComparisonSet>;
}

/**
 * Once the live scorecard has loaded, it is authoritative even when a game has
 * no qualifying quote. Clearing the static comparison prevents an older
 * snapshot from surviving a live eligibility or schedule change.
 */
export function applyLiveFootballMarketComparisons(
  game: Game,
  liveComparisons: Record<string, LiveFootballMarketComparisonSet> | null,
  expectedModelId?: string,
): Game {
  if (liveComparisons === null) return game;
  const linked = liveComparisons[game.id];
  const modelId = game.prediction?.model_id || expectedModelId;
  // A quote's model difference is only meaningful beside the exact forecast
  // edition that produced it. Missing lineage fails closed rather than
  // allowing a prior edition's line to appear beside a newer estimate.
  if (!linked || !linked.model_id || !modelId || linked.model_id !== modelId) {
    return { ...game, market_comparisons: [] };
  }
  return { ...game, market_comparisons: linked.comparisons };
}

export function mergeLiveFootballForecasts(games: Game[], rows: LiveFootballForecastRow[]) {
  const liveById = new Map(rows.map((row) => [row.game_id, row]));
  return games.map((game) => {
    const live = liveById.get(game.id);
    if (!live) return game;
    if (!validLiveFootballForecast(live)) return game;
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
      model_id: live.model_id || game.prediction?.model_id,
      generated_at: live.created_at || game.prediction?.generated_at,
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
