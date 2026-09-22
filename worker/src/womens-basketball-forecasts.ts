import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const querySchema = z.object({
  season: z.coerce.number().int().min(2023).max(2035).default(2027),
  status: z.enum(["all", "upcoming", "completed"]).default("upcoming"),
  gameId: z.string().trim().regex(/^\d{1,30}$/).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  meta: z.enum(["0", "1"]).default("0"),
});

const CACHE_TTL = 300;
const ASSET_TIMEOUT_MS = 3000;

type WomenPrediction = Record<string, unknown>;
type WomenForecast = {
  game_id: string;
  season: number;
  date: string | null;
  starts_at: string | null;
  home_id: string;
  away_id: string;
  home_name: string | null;
  away_name: string | null;
  status: "upcoming";
  model_id: string;
  created_at: string | null;
  prediction: WomenPrediction;
  prediction_integrity: "valid";
};

type WomenArtifact = {
  schema_version?: unknown;
  model_id?: unknown;
  sport?: unknown;
  gender?: unknown;
  target_season?: unknown;
  generated_at?: unknown;
  model_status?: unknown;
  method?: unknown;
  training_seasons?: unknown;
  validation_season?: unknown;
  validation?: unknown;
  calibration?: unknown;
  home_advantage?: unknown;
  coverage?: unknown;
  market_comparison?: unknown;
  receipts?: unknown;
  forecasts?: unknown;
  limitations?: unknown;
};

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("women's forecast asset timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * The published WBB artifact rounds scores and margins independently. Keep a
 * small tolerance for that display rounding, but reject a row whose score
 * pair cannot produce the recorded margin.
 */
export const WOMENS_PREDICTION_ARITHMETIC_TOLERANCE = 0.11;

export function validWomensPredictionArithmetic(
  prediction: Record<string, unknown>,
  tolerance = WOMENS_PREDICTION_ARITHMETIC_TOLERANCE,
): boolean {
  if (!Number.isFinite(tolerance) || tolerance < 0) return false;
  const home = prediction.predicted_home_score;
  const away = prediction.predicted_away_score;
  const margin = prediction.predicted_margin;
  if (!finiteNumber(home) || !finiteNumber(away) || !finiteNumber(margin)) return false;
  if (home < 0 || away < 0) return false;
  return Math.abs((home - away) - margin) <= tolerance;
}

/**
 * Validate the source-native WBB edition before it crosses the API boundary.
 * The endpoint deliberately accepts only the women's artifact identity and
 * never falls back to the men's D1 forecast warehouse.
 */
export function parseWomensForecastArtifact(value: unknown): {
  artifact: WomenArtifact | null;
  forecasts: WomenForecast[];
  invalid_rows: number;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { artifact: null, forecasts: [], invalid_rows: 0 };
  }
  const artifact = value as WomenArtifact;
  if (artifact.sport !== "basketball" || artifact.gender !== "women"
    || artifact.target_season !== 2027 || typeof artifact.model_id !== "string"
    || artifact.model_id.length === 0 || !Array.isArray(artifact.forecasts)) {
    return { artifact: null, forecasts: [], invalid_rows: 0 };
  }
  const forecasts: WomenForecast[] = [];
  let invalid_rows = 0;
  for (const value of artifact.forecasts) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      invalid_rows += 1;
      continue;
    }
    const row = value as Record<string, unknown>;
    const gameId = typeof row.game_id === "string" ? row.game_id : "";
    const homeId = typeof row.home_id === "string" ? row.home_id : "";
    const awayId = typeof row.away_id === "string" ? row.away_id : "";
    const prediction = row.prediction;
    if (!/^\d{1,30}$/.test(gameId) || !homeId || !awayId
      || !prediction || typeof prediction !== "object" || Array.isArray(prediction)) {
      invalid_rows += 1;
      continue;
    }
    const checked = prediction as WomenPrediction;
    const probability = checked.home_win_probability;
    const awayProbability = checked.away_win_probability;
    const margin = checked.predicted_margin;
    const numericValues = [probability, awayProbability, margin, checked.predicted_home_score, checked.predicted_away_score];
    if (numericValues.some((item) => !finiteNumber(item))
      || (probability as number) < 0 || (probability as number) > 1
      || (awayProbability as number) < 0 || (awayProbability as number) > 1
      || Math.abs((probability as number) + (awayProbability as number) - 1) > 0.001
      || !validWomensPredictionArithmetic(checked)) {
      invalid_rows += 1;
      continue;
    }
    const estimateType = checked.estimate_type;
    if (estimateType !== "primary" && estimateType !== "cold_start") {
      invalid_rows += 1;
      continue;
    }
    const low = checked.margin_low;
    const high = checked.margin_high;
    if (!finiteNumber(low) || !finiteNumber(high) || (low as number) > (high as number)
      || (margin as number) < (low as number) || (margin as number) > (high as number)) {
      invalid_rows += 1;
      continue;
    }
    forecasts.push({
      game_id: gameId,
      season: 2027,
      date: typeof row.date === "string" ? row.date : null,
      starts_at: typeof row.date === "string" ? row.date : null,
      home_id: homeId,
      away_id: awayId,
      home_name: typeof row.home === "string" ? row.home : null,
      away_name: typeof row.away === "string" ? row.away : null,
      status: "upcoming",
      model_id: artifact.model_id,
      created_at: typeof artifact.generated_at === "string" ? artifact.generated_at : null,
      prediction: checked,
      prediction_integrity: "valid",
    });
  }
  return { artifact, forecasts, invalid_rows };
}

function publicReceipts(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([dataset, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const receipt = raw as Record<string, unknown>;
    return [{
      dataset,
      sha256: typeof receipt.sha256 === "string" ? receipt.sha256 : null,
    }];
  });
}

function metadata(artifact: WomenArtifact, total: number, invalidRows: number) {
  return {
    model_id: artifact.model_id,
    model_status: typeof artifact.model_status === "string" ? artifact.model_status : null,
    sport: "basketball",
    gender: "women",
    target_season: artifact.target_season,
    generated_at: typeof artifact.generated_at === "string" ? artifact.generated_at : null,
    method: typeof artifact.method === "string" ? artifact.method : null,
    training_seasons: Array.isArray(artifact.training_seasons) ? artifact.training_seasons : [],
    validation_season: artifact.validation_season ?? null,
    validation: artifact.validation ?? null,
    calibration: artifact.calibration ?? null,
    home_advantage: finiteNumber(artifact.home_advantage) ? artifact.home_advantage : null,
    coverage: artifact.coverage ?? null,
    market_comparison: artifact.market_comparison ?? null,
    integrity: {
      source_rows: Array.isArray(artifact.forecasts) ? artifact.forecasts.length : 0,
      valid_rows: total,
      invalid_rows: invalidRows,
      source: "published_asset",
    },
    receipts: publicReceipts(artifact.receipts),
    limitations: Array.isArray(artifact.limitations) ? artifact.limitations : [],
  };
}

async function loadArtifact(c: { env: Bindings; req: { url: string } }): Promise<ReturnType<typeof parseWomensForecastArtifact> | null> {
  if (!c.env.ASSETS) return null;
  const response = await withTimeout(
    c.env.ASSETS.fetch(new Request(new URL("/data/basketball/womens-forecast.json", c.req.url))),
    ASSET_TIMEOUT_MS,
  );
  if (!response.ok) return null;
  return parseWomensForecastArtifact(await response.json());
}

export const womensBasketballForecasts = new Hono<{ Bindings: Bindings }>();

womensBasketballForecasts.get("/", zValidator("query", querySchema), async (c) => {
  const { season, status, gameId, q, page, limit, meta } = c.req.valid("query");
  if (season !== 2027) {
    return c.json({ season, status, total: 0, rows: [], model: null, source: "published_asset" });
  }
  try {
    const loaded = await loadArtifact(c);
    if (!loaded?.artifact) {
      return c.json({ error: "The published women's basketball forecast is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
    if (meta === "1") {
      const response = c.json({ season, source: "published_asset", model: metadata(loaded.artifact, loaded.forecasts.length, loaded.invalid_rows) });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      return response;
    }
    if (status === "completed") {
      const response = c.json({ season, status, page, page_size: limit, total: 0, source: "published_asset", model_id: loaded.artifact.model_id, rows: [] });
      response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      return response;
    }
    const query = q?.toLocaleLowerCase();
    const filtered = loaded.forecasts.filter((row) => {
      if (gameId && row.game_id !== gameId) return false;
      if (query && !`${row.home_name || ""} ${row.away_name || ""}`.toLocaleLowerCase().includes(query)) return false;
      return true;
    });
    const start = page * limit;
    const response = c.json({
      season,
      status,
      page,
      page_size: limit,
      total: filtered.length,
      source: "published_asset",
      model_id: loaded.artifact.model_id,
      integrity: { source_rows: Array.isArray(loaded.artifact.forecasts) ? loaded.artifact.forecasts.length : 0, invalid_rows: loaded.invalid_rows },
      rows: filtered.slice(start, start + limit),
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    return response;
  } catch {
    return c.json({ error: "The published women's basketball forecast is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
