import { researchDb } from "./research-db";
import { Context, Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = Env;

const querySchema = z.object({
  season: z.coerce.number().int().min(2023).max(2035).default(2027),
  gameId: z.string().trim().regex(/^\d{1,30}$/).optional(),
  status: z.enum(["all", "upcoming", "completed"]).default("all"),
  q: z.string().trim().max(120).optional(),
  model: z.union([
    z.literal("latest"),
    z.literal("all"),
    z.string().trim().regex(/^[A-Za-z0-9._-]{1,120}$/),
  ]).default("latest"),
  roster: z.enum(["0", "1"]).default("0"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  meta: z.enum(["0", "1"]).default("0"),
});

export const basketballForecasts = new Hono<{ Bindings: Bindings }>();
const CACHE_TTL = 300;
const DB_TIMEOUT_MS = 5000;
// The catalog joins model metadata to every retained edition. Keep ordinary
// row reads tight, but allow this read-only summary a little more time on a
// cold D1 edge without turning a transient slow read into a 503.
const META_DB_TIMEOUT_MS = 12000;
const PUBLISHED_FORECAST_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("basketball forecast database query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

type RosterLens = {
  game_id: string;
  home_id: string;
  away_id: string;
  primary_model_id: string;
  base_margin: number;
  roster_margin: number;
  margin_delta: number;
  home_predicted_net: number;
  away_predicted_net: number;
  roster_home_win_probability: number;
  roster_margin_low: number;
  roster_margin_high: number;
};

type RosterModelArtifact = {
  version?: unknown;
  generated_at?: unknown;
  primary_model_id?: unknown;
  coverage?: { scenario_games?: unknown; current_predicted_teams?: unknown };
  evaluation?: { held_out_transition?: unknown; improvement_vs_prior_net?: unknown; mae?: unknown };
  scenarios?: unknown;
};

function parseRosterLens(value: unknown, expectedModelId: string): RosterLens | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const fields = ["game_id", "home_id", "away_id", "primary_model_id"];
  if (fields.some((field) => typeof row[field] !== "string")) return null;
  if (row.primary_model_id !== expectedModelId) return null;
  const numbers = ["base_margin", "roster_margin", "margin_delta", "home_predicted_net", "away_predicted_net", "roster_home_win_probability", "roster_margin_low", "roster_margin_high"];
  if (numbers.some((field) => typeof row[field] !== "number" || !Number.isFinite(row[field] as number))) return null;
  if ((row.roster_home_win_probability as number) < 0 || (row.roster_home_win_probability as number) > 1) return null;
  if ((row.roster_margin_low as number) > (row.roster_margin as number) || (row.roster_margin_high as number) < (row.roster_margin as number)) return null;
  return row as unknown as RosterLens;
}

function rosterModelSummary(artifact: RosterModelArtifact, source: "d1" | "published_asset") {
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  const coverage = artifact.coverage || {};
  const evaluation = artifact.evaluation || {};
  return {
    version: typeof artifact.version === "string" ? artifact.version : null,
    generated_at: typeof artifact.generated_at === "string" ? artifact.generated_at : null,
    primary_model_id: typeof artifact.primary_model_id === "string" ? artifact.primary_model_id : null,
    scenario_games: number(coverage.scenario_games),
    current_predicted_teams: number(coverage.current_predicted_teams),
    held_out_transition: number(evaluation.held_out_transition),
    improvement_vs_prior_net: number(evaluation.improvement_vs_prior_net),
    mae: number(evaluation.mae),
    source,
  };
}

async function readRosterLenses(
  c: Context<{ Bindings: Bindings }>,
  modelId: string | null,
  gameIds: string[],
) {
  const empty = { lenses: new Map<string, RosterLens>(), model: null };
  if (!modelId) return empty;
  const database = researchDb(c.env);
  if (gameIds.length && typeof database.batch === "function") {
    try {
      const placeholders = gameIds.map(() => "?").join(",");
      const [metadataResult, scenarioResult] = await withTimeout(database.batch([
        database.prepare(
          "SELECT metadata_json FROM bb_roster_models WHERE primary_model_id=? LIMIT 1",
        ).bind(modelId),
        database.prepare(
          `SELECT lens_json FROM bb_roster_scenarios WHERE primary_model_id=? AND game_id IN (${placeholders})`,
        ).bind(modelId, ...gameIds),
      ]), DB_TIMEOUT_MS);
      const metadataJson = (metadataResult.results[0] as { metadata_json?: unknown } | undefined)?.metadata_json;
      if (typeof metadataJson === "string") {
        const parsed = JSON.parse(metadataJson) as RosterModelArtifact;
        if (parsed.primary_model_id === modelId) {
          const lenses = new Map<string, RosterLens>();
          for (const row of scenarioResult.results) {
            const lensJson = (row as { lens_json?: unknown }).lens_json;
            if (typeof lensJson !== "string") continue;
            const lens = parseRosterLens(JSON.parse(lensJson) as unknown, modelId);
            if (lens) lenses.set(lens.game_id, lens);
          }
          return { lenses, model: rosterModelSummary(parsed, "d1") };
        }
      }
    } catch {
      // Older deployments may not have the roster tables yet. The bundled
      // artifact remains a safe fallback only when its exact edition matches.
    }
  }
  if (!c.env.ASSETS) return empty;
  try {
    const response = await withTimeout(
      c.env.ASSETS.fetch(new Request(new URL("/data/basketball/roster-model.json", c.req.url))),
      2000,
    );
    if (!response.ok) return { lenses: new Map<string, RosterLens>(), model: null };
    const artifact = await response.json() as RosterModelArtifact;
    if (artifact.primary_model_id !== modelId) return empty;
    const rows = Array.isArray(artifact.scenarios) ? artifact.scenarios : [];
    const lenses = new Map<string, RosterLens>();
    for (const value of rows) {
      const lens = parseRosterLens(value, modelId);
      if (lens && gameIds.includes(lens.game_id)) lenses.set(lens.game_id, lens);
    }
    return { lenses, model: rosterModelSummary(artifact, "published_asset") };
  } catch {
    return empty;
  }
}

type PublishedForecastOverview = {
  season?: unknown;
  generated_at?: unknown;
  model?: { id?: unknown };
  upcoming?: unknown;
};

const matchupFactorKeys = ["efg", "tov", "orb", "ftr"] as const;
const matchupFactorValueKeys = ["home_offense", "home_defense", "away_offense", "away_defense"] as const;
type MatchupFactorKey = (typeof matchupFactorKeys)[number];
type MatchupFactors = {
  season: number;
  factors: Record<MatchupFactorKey, Record<(typeof matchupFactorValueKeys)[number], number>>;
  edges: Record<MatchupFactorKey, number>;
};
type MatchupFactorRead = {
  factors: MatchupFactors | null;
  integrity: "valid" | "invalid" | "unavailable";
  source: "forecast_payload" | "published_asset" | null;
  model_id: string | null;
  generated_at: string | null;
};

/**
 * Validate the four-factor context independently of the score prediction.
 * The publisher uses rates in [0,1] and signed home-team edges; retaining only
 * this fixed shape prevents arbitrary source JSON from becoming model context.
 */
export function parseForecastMatchupFactors(value: unknown): {
  factors: MatchupFactors | null;
  integrity: "valid" | "invalid" | "unavailable";
} {
  if (value == null) return { factors: null, integrity: "unavailable" };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { factors: null, integrity: "invalid" };
  const row = value as Record<string, unknown>;
  const season = row.season;
  if (typeof season !== "number" || !Number.isInteger(season) || season < 1900 || season > 2200) {
    return { factors: null, integrity: "invalid" };
  }
  const sourceFactors = row.factors;
  const sourceEdges = row.edges;
  if (!sourceFactors || typeof sourceFactors !== "object" || Array.isArray(sourceFactors)
    || !sourceEdges || typeof sourceEdges !== "object" || Array.isArray(sourceEdges)) {
    return { factors: null, integrity: "invalid" };
  }
  const factors = {} as MatchupFactors["factors"];
  const edges = {} as MatchupFactors["edges"];
  for (const key of matchupFactorKeys) {
    const source = (sourceFactors as Record<string, unknown>)[key];
    const edge = (sourceEdges as Record<string, unknown>)[key];
    if (!source || typeof source !== "object" || Array.isArray(source)
      || typeof edge !== "number" || !Number.isFinite(edge) || edge < -1 || edge > 1) {
      return { factors: null, integrity: "invalid" };
    }
    const parsed = {} as MatchupFactors["factors"][MatchupFactorKey];
    for (const field of matchupFactorValueKeys) {
      const metric = (source as Record<string, unknown>)[field];
      if (typeof metric !== "number" || !Number.isFinite(metric) || metric < 0 || metric > 1) {
        return { factors: null, integrity: "invalid" };
      }
      parsed[field] = metric;
    }
    factors[key] = parsed;
    edges[key] = edge;
  }
  return { factors: { season, factors, edges }, integrity: "valid" };
}

const predictionNumericFields = [
  "home_score",
  "away_score",
  "home_efficiency",
  "away_efficiency",
  "home_margin",
  "total",
  "pace",
  "home_win_probability",
  "margin_low",
  "margin_high",
  "margin_half_width",
] as const;

/**
 * Keep malformed stored values from reaching forecast consumers as if they
 * were model output. The warehouse intentionally remains the source of truth;
 * this is a response boundary check for known scalar fields only, so adding a
 * future model field does not silently discard an otherwise valid estimate.
 */
export function parseForecastPrediction(value: unknown): { prediction: Record<string, unknown> | null; integrity: "valid" | "invalid" } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { prediction: null, integrity: "invalid" };
  }
  const row = value as Record<string, unknown>;
  for (const field of predictionNumericFields) {
    if (field in row && (typeof row[field] !== "number" || !Number.isFinite(row[field] as number))) {
      return { prediction: null, integrity: "invalid" };
    }
  }
  const probability = row.home_win_probability;
  if (typeof probability === "number" && (probability < 0 || probability > 1)) {
    return { prediction: null, integrity: "invalid" };
  }
  const low = row.margin_low;
  const high = row.margin_high;
  if (typeof low === "number" && typeof high === "number" && low > high) {
    return { prediction: null, integrity: "invalid" };
  }
  const margin = row.home_margin;
  if (typeof margin === "number" && typeof low === "number" && typeof high === "number" && (margin < low || margin > high)) {
    return { prediction: null, integrity: "invalid" };
  }
  if ("estimate_type" in row && row.estimate_type !== "primary" && row.estimate_type !== "cold_start") {
    return { prediction: null, integrity: "invalid" };
  }
  // Older D1 editions predate the explicit efficiency fields. Derive the
  // descriptive points-per-100-possession view from the same published score
  // and pace so the response remains useful without changing the model score
  // or pretending this is an observed stat.
  const normalized = { ...row };
  const pace = normalized.pace;
  const homeScore = normalized.home_score;
  const awayScore = normalized.away_score;
  if (
    typeof pace === "number" && Number.isFinite(pace) && pace > 0
    && typeof homeScore === "number" && Number.isFinite(homeScore)
    && typeof awayScore === "number" && Number.isFinite(awayScore)
  ) {
    if (!(typeof normalized.home_efficiency === "number" && Number.isFinite(normalized.home_efficiency))) {
      normalized.home_efficiency = Math.round((100 * homeScore / pace) * 100) / 100;
    }
    if (!(typeof normalized.away_efficiency === "number" && Number.isFinite(normalized.away_efficiency))) {
      normalized.away_efficiency = Math.round((100 * awayScore / pace) * 100) / 100;
    }
  }
  return { prediction: normalized, integrity: "valid" };
}

async function publishedForecastFallback(
  c: Context<{ Bindings: Bindings }>,
  args: { season: number; gameId?: string; status: string; q?: string; model: string; roster: string; page: number; limit: number },
): Promise<Response | null> {
  // The bundled overview is an intentionally narrow safety net for the
  // default published board. Keep filtered or historical requests honest and
  // let them retain the normal retryable D1 error when the warehouse is down.
  if (
    !c.env.ASSETS
    || args.season !== 2027
    || args.status !== "upcoming"
    || args.gameId
    || args.q
    || args.model !== "latest"
    || args.roster !== "0"
  ) return null;
  try {
    const asset = await withTimeout(
      c.env.ASSETS.fetch(new Request(new URL("/data/basketball/overview.json", c.req.url))),
      PUBLISHED_FORECAST_TIMEOUT_MS,
    );
    if (!asset.ok) return null;
    const overview = await asset.json() as PublishedForecastOverview;
    const upcoming = Array.isArray(overview.upcoming) ? overview.upcoming : [];
    const modelId = typeof overview.model?.id === "string" ? overview.model.id : "published-basketball-efficiency";
    const createdAt = typeof overview.generated_at === "string" ? overview.generated_at : null;
    const rows = upcoming
      .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"))
      .map((game) => {
        const rawPrediction = game.prediction && typeof game.prediction === "object" && !Array.isArray(game.prediction)
          ? game.prediction
          : game.fallback_prediction && typeof game.fallback_prediction === "object" && !Array.isArray(game.fallback_prediction)
            ? game.fallback_prediction
            : null;
        const checkedPrediction = parseForecastPrediction(rawPrediction);
        const checkedFactors = parseForecastMatchupFactors(game.matchup_factors);
        return {
          game_id: typeof game.id === "string" ? game.id : String(game.id || ""),
          model_id: modelId,
          created_at: createdAt,
          season: Number(game.season || overview.season || 2027),
          starts_at: typeof game.starts_at === "string" ? game.starts_at : null,
          home_id: typeof game.home_id === "string" ? game.home_id : String(game.home_id || ""),
          away_id: typeof game.away_id === "string" ? game.away_id : String(game.away_id || ""),
          home_name: typeof game.home_name === "string" ? game.home_name : null,
          away_name: typeof game.away_name === "string" ? game.away_name : null,
          home_score: game.home_score == null ? null : Number(game.home_score),
          away_score: game.away_score == null ? null : Number(game.away_score),
          completed: Number(game.completed || 0),
          neutral: Number(game.neutral || 0),
          time_tbd: Number(game.time_tbd || 0),
          venue: typeof game.venue === "string" ? game.venue : null,
          broadcast: typeof game.broadcast === "string" ? game.broadcast : null,
          source_start: null,
          source_time_valid: null,
          source_observed_at: null,
          prediction: checkedPrediction.prediction,
          prediction_integrity: checkedPrediction.integrity,
          matchup_factors: checkedFactors.factors,
          matchup_factors_integrity: checkedFactors.integrity,
          matchup_factors_source: checkedFactors.factors ? "published_asset" : null,
          matchup_factors_model_id: checkedFactors.factors ? modelId : null,
          matchup_factors_generated_at: checkedFactors.factors ? createdAt : null,
          matchup_factors_same_edition: checkedFactors.factors ? true : null,
        };
      });
    const start = args.page * args.limit;
    const response = c.json({
      season: args.season,
      status: args.status,
      model: args.model,
      query: null,
      page: args.page,
      page_size: args.limit,
      total: rows.length,
      source: "published_fallback",
      rows: rows.slice(start, start + args.limit),
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    return response;
  } catch {
    return null;
  }
}

async function publishedMatchupFactors(
  c: Context<{ Bindings: Bindings }>,
  args: { season: number; status: string; gameId?: string; q?: string; model: string; roster: string },
  gameIds: string[],
): Promise<Map<string, MatchupFactorRead>> {
  const result = new Map<string, MatchupFactorRead>();
  // Factors are a published upcoming-board context. Do not attach the asset
  // to filtered, historical, explicitly selected, or roster-challenger reads.
  if (
    !c.env.ASSETS
    || args.season !== 2027
    || args.status !== "upcoming"
    || args.gameId
    || args.q
    || args.model !== "latest"
    || args.roster !== "0"
    || !gameIds.length
  ) return result;
  try {
    const asset = await withTimeout(
      c.env.ASSETS.fetch(new Request(new URL("/data/basketball/overview.json", c.req.url))),
      PUBLISHED_FORECAST_TIMEOUT_MS,
    );
    if (!asset.ok) return result;
    const overview = await asset.json() as PublishedForecastOverview;
    const overviewSeason = typeof overview.season === "number" && Number.isInteger(overview.season)
      ? overview.season
      : null;
    if (overviewSeason !== args.season) return result;
    const modelId = typeof overview.model?.id === "string" ? overview.model.id : null;
    const generatedAt = typeof overview.generated_at === "string" ? overview.generated_at : null;
    const wanted = new Set(gameIds);
    for (const value of Array.isArray(overview.upcoming) ? overview.upcoming : []) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const game = value as Record<string, unknown>;
      const id = typeof game.id === "string" ? game.id : String(game.id || "");
      if (!wanted.has(id)) continue;
      const checked = parseForecastMatchupFactors(game.matchup_factors);
      result.set(id, {
        factors: checked.factors,
        integrity: checked.integrity,
        source: checked.factors ? "published_asset" : null,
        model_id: checked.factors ? modelId : null,
        generated_at: checked.factors ? generatedAt : null,
      });
    }
    return result;
  } catch {
    return result;
  }
}

basketballForecasts.get("/", zValidator("query", querySchema), async (c) => {
  const { season, gameId, status, q, model, roster, page, limit, meta } = c.req.valid("query");
  const cache = typeof caches === "undefined"
    ? null
    : (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the forecast endpoint fail.
    }
  }

  if (meta === "1") {
    try {
    const [seasons, models, modelMeta] = await withTimeout(researchDb(c.env).batch([
      researchDb(c.env).prepare(
        "SELECT DISTINCT g.season FROM bb_forecasts f JOIN bb_games g ON g.id=f.game_id ORDER BY g.season DESC",
      ),
      researchDb(c.env).prepare(
        `SELECT f.model_id,
                count(*) AS forecasts,
                SUM(CASE
                      WHEN json_valid(f.prediction_json)=1
                       AND json_type(CASE WHEN json_valid(f.prediction_json)=1 THEN f.prediction_json ELSE '{}' END)='object'
                       AND COALESCE(json_extract(CASE WHEN json_valid(f.prediction_json)=1 THEN f.prediction_json ELSE '{}' END,'$.estimate_type'),'primary')<>'cold_start'
                      THEN 1 ELSE 0 END) AS primary_forecasts,
                SUM(CASE
                      WHEN json_valid(f.prediction_json)=1
                       AND json_type(CASE WHEN json_valid(f.prediction_json)=1 THEN f.prediction_json ELSE '{}' END)='object'
                       AND json_extract(CASE WHEN json_valid(f.prediction_json)=1 THEN f.prediction_json ELSE '{}' END,'$.estimate_type')='cold_start'
                      THEN 1 ELSE 0 END) AS cold_start_forecasts,
                SUM(CASE
                      WHEN json_valid(f.prediction_json)=0
                        OR json_type(CASE WHEN json_valid(f.prediction_json)=1 THEN f.prediction_json ELSE '{}' END)<>'object'
                      THEN 1 ELSE 0 END) AS invalid_forecasts,
                MIN(f.created_at) AS first_created_at,
                MAX(f.created_at) AS last_created_at
           FROM bb_forecasts f
           JOIN bb_games g ON g.id=f.game_id
          WHERE g.season=?
          GROUP BY f.model_id
          ORDER BY last_created_at DESC,f.model_id`,
      ).bind(season),
      researchDb(c.env).prepare(
        `SELECT id AS model_id, created_at AS model_created_at,
                json_extract(artifact_json,'$.version') AS version,
                json_extract(artifact_json,'$.target_season') AS target_season,
                json_extract(artifact_json,'$.cutoff') AS cutoff,
                json_extract(artifact_json,'$.training_games') AS training_games,
                json_extract(artifact_json,'$.training_seasons') AS training_seasons,
                json_extract(artifact_json,'$.expected_forecasts') AS expected_forecasts,
                json_extract(artifact_json,'$.calibration.season') AS calibration_season,
                json_extract(artifact_json,'$.calibration.games') AS calibration_games,
                json_extract(artifact_json,'$.calibration.margin_half_width') AS margin_half_width,
                json_extract(artifact_json,'$.evaluation.season') AS evaluation_season,
                json_extract(artifact_json,'$.evaluation.games') AS evaluation_games,
                json_extract(artifact_json,'$.evaluation.unscored_games') AS evaluation_unscored_games,
                json_extract(artifact_json,'$.evaluation.winner_accuracy') AS evaluation_winner_accuracy,
                json_extract(artifact_json,'$.evaluation.margin_mae') AS evaluation_margin_mae,
                json_extract(artifact_json,'$.evaluation.margin_rmse') AS evaluation_margin_rmse,
                json_extract(artifact_json,'$.evaluation.total_mae') AS evaluation_total_mae,
                json_extract(artifact_json,'$.evaluation.brier') AS evaluation_brier,
                json_extract(artifact_json,'$.evaluation.log_loss') AS evaluation_log_loss,
                json_extract(artifact_json,'$.evaluation.baseline_margin_mae') AS evaluation_baseline_margin_mae,
                json_extract(artifact_json,'$.evaluation.interval_coverage') AS evaluation_interval_coverage,
                json_extract(artifact_json,'$.calibration.fallback_margin_half_width') AS fallback_margin_half_width,
                json_extract(artifact_json,'$.calibration.fallback_games') AS fallback_games
           FROM bb_models
          ORDER BY created_at DESC, id`,
      ),
    ]), META_DB_TIMEOUT_MS);
    const metadataById = new Map(
      modelMeta.results.map((row) => {
        const item = row as Record<string, unknown>;
        return [item.model_id, item] as const;
      }),
    );
    const modelsWithMetadata = models.results.map((row) => {
      const aggregate = row as Record<string, unknown>;
      const item = { ...aggregate, ...(metadataById.get(aggregate.model_id) || {}) };
      let trainingSeasons: number[] = [];
      if (typeof item.training_seasons === "string") {
        try {
          const parsed = JSON.parse(item.training_seasons) as unknown;
          if (Array.isArray(parsed)) trainingSeasons = parsed.map(Number).filter(Number.isFinite);
        } catch {
          // A malformed artifact field is represented as an empty catalog value.
        }
      }
      return {
        ...item,
        forecasts: Number(item.forecasts || 0),
        primary_forecasts: Number(item.primary_forecasts || 0),
        cold_start_forecasts: Number(item.cold_start_forecasts || 0),
        invalid_forecasts: Number(item.invalid_forecasts || 0),
        target_season: item.target_season == null ? null : Number(item.target_season),
        training_games: item.training_games == null ? null : Number(item.training_games),
        training_seasons: trainingSeasons,
        expected_forecasts: item.expected_forecasts == null ? null : Number(item.expected_forecasts),
        publication_complete: item.expected_forecasts == null
          ? true
          : Number(item.forecasts || 0) === Number(item.expected_forecasts),
        calibration_season: item.calibration_season == null ? null : Number(item.calibration_season),
        calibration_games: item.calibration_games == null ? null : Number(item.calibration_games),
        margin_half_width: item.margin_half_width == null ? null : Number(item.margin_half_width),
        fallback_margin_half_width: item.fallback_margin_half_width == null ? null : Number(item.fallback_margin_half_width),
        fallback_games: item.fallback_games == null ? null : Number(item.fallback_games),
        evaluation_season: item.evaluation_season == null ? null : Number(item.evaluation_season),
        evaluation_games: item.evaluation_games == null ? null : Number(item.evaluation_games),
        evaluation_unscored_games: item.evaluation_unscored_games == null ? null : Number(item.evaluation_unscored_games),
        evaluation_winner_accuracy: item.evaluation_winner_accuracy == null ? null : Number(item.evaluation_winner_accuracy),
        evaluation_margin_mae: item.evaluation_margin_mae == null ? null : Number(item.evaluation_margin_mae),
        evaluation_margin_rmse: item.evaluation_margin_rmse == null ? null : Number(item.evaluation_margin_rmse),
        evaluation_total_mae: item.evaluation_total_mae == null ? null : Number(item.evaluation_total_mae),
        evaluation_brier: item.evaluation_brier == null ? null : Number(item.evaluation_brier),
        evaluation_log_loss: item.evaluation_log_loss == null ? null : Number(item.evaluation_log_loss),
        evaluation_baseline_margin_mae: item.evaluation_baseline_margin_mae == null ? null : Number(item.evaluation_baseline_margin_mae),
        evaluation_interval_coverage: item.evaluation_interval_coverage == null ? null : Number(item.evaluation_interval_coverage),
      };
    });
    // Forecast rows can outlive their model metadata during a replay. Keep
    // metadata-backed editions first so `latest` in the catalog is usable.
    modelsWithMetadata.sort((left, right) => {
      const leftRecord = left as Record<string, unknown>;
      const rightRecord = right as Record<string, unknown>;
      const leftComplete = left.publication_complete ? 0 : 1;
      const rightComplete = right.publication_complete ? 0 : 1;
      if (leftComplete !== rightComplete) return leftComplete - rightComplete;
      const leftUsable = left.target_season == null ? 1 : 0;
      const rightUsable = right.target_season == null ? 1 : 0;
      if (leftUsable !== rightUsable) return leftUsable - rightUsable;
      return String(rightRecord.last_created_at || "").localeCompare(String(leftRecord.last_created_at || ""));
    });
    const response = c.json({
      seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
      models: modelsWithMetadata,
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
    } catch {
      return c.json({ error: "The live basketball forecast catalog is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
    }
  }

  const clauses = ["g.season=?"];
  const binds: Array<string | number> = [season];
  if (gameId) {
    clauses.push("f.game_id=?");
    binds.push(gameId);
  }
  if (status === "upcoming") clauses.push("g.completed=0");
  if (status === "completed") clauses.push("g.completed=1");
  if (q) {
    const search = `%${escapeLike(q)}%`;
    clauses.push("(g.home_name LIKE ? ESCAPE '\\' OR g.away_name LIKE ? ESCAPE '\\')");
    binds.push(search, search);
  }
  if (model === "latest") {
    // A model row can be registered before its forecast batch finishes, and
    // retained metadata can include editions for a different season. Resolve
    // `latest` from editions that actually have rows in the requested season
    // so a partial publication cannot make a complete prior slate disappear.
    clauses.push(`f.model_id=(
      SELECT f_latest.model_id
        FROM bb_forecasts f_latest
        JOIN bb_games g_latest ON g_latest.id=f_latest.game_id
        JOIN bb_models m_latest ON m_latest.id=f_latest.model_id
       WHERE g_latest.season=?
       GROUP BY f_latest.model_id
      HAVING COUNT(*)=COALESCE(
               json_extract(m_latest.artifact_json,'$.expected_forecasts'),
               COUNT(*)
             )
       ORDER BY MAX(COALESCE(m_latest.created_at,f_latest.created_at)) DESC,
                f_latest.model_id DESC
       LIMIT 1
    )`);
    binds.push(season);
  } else if (model !== "all") {
    clauses.push("f.model_id=?");
    binds.push(model);
  }
  const where = clauses.join(" AND ");
  try {
  const count = await withTimeout(researchDb(c.env).prepare(
    `SELECT count(*) AS total FROM bb_forecasts f JOIN bb_games g ON g.id=f.game_id WHERE ${where}`,
  ).bind(...binds).first<{ total: number }>(), DB_TIMEOUT_MS);
  // D1 can briefly return a healthy but empty forecast slice while a publish
  // is being replicated. For the default published board, serve the bundled
  // edition instead of turning that transient state into a blank homepage.
  // Filtered, historical, and explicitly selected model requests remain
  // fail-closed because the asset cannot answer those queries faithfully.
  if (Number(count?.total || 0) === 0) {
    const fallback = await publishedForecastFallback(c, { season, gameId, status, q, model, roster, page, limit });
    if (fallback) {
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, fallback.clone()).catch(() => undefined));
      return fallback;
    }
  }
  const rows = await withTimeout(researchDb(c.env).prepare(
    `WITH latest_schedule AS (
        SELECT game_id,source_start,source_time_valid,observed_at,
               ROW_NUMBER() OVER (PARTITION BY sport,game_id ORDER BY observed_at DESC,id DESC) AS schedule_rank
           FROM audit_schedule_times
          WHERE sport='basketball'
      )
      SELECT f.game_id,f.model_id,f.created_at,f.prediction_json,
            g.season,g.starts_at,g.home_id,g.away_id,g.home_name,g.away_name,
            g.home_score,g.away_score,g.completed,g.neutral,g.time_tbd,g.venue,g.broadcast,
            s.source_start,s.source_time_valid,s.observed_at AS source_observed_at
       FROM bb_forecasts f JOIN bb_games g ON g.id=f.game_id
       LEFT JOIN latest_schedule s ON s.game_id=f.game_id AND s.schedule_rank=1
      WHERE ${where}
      ORDER BY g.starts_at ASC,f.created_at ASC,f.model_id ASC
      LIMIT ? OFFSET ?`,
  ).bind(...binds, limit, page * limit).all<{
    game_id: string;
    model_id: string;
    created_at: string;
    prediction_json: string;
    season: number;
    starts_at: string;
    home_id: string;
    away_id: string;
    home_name: string | null;
    away_name: string | null;
    home_score: number | null;
    away_score: number | null;
    completed: number;
    neutral: number;
    time_tbd: number;
    venue: string | null;
    broadcast: string | null;
    source_start: string | null;
    source_time_valid: number | null;
    source_observed_at: string | null;
  }>(), DB_TIMEOUT_MS);
  const publishedFactors = await publishedMatchupFactors(
    c,
    { season, status, gameId, q, model, roster },
    rows.results.map((row) => row.game_id),
  );
  const resolvedModelIds = new Set(rows.results.map((row) => row.model_id));
  const resolvedModelId = resolvedModelIds.size === 1 ? [...resolvedModelIds][0] : null;
  const rosterArtifact = roster === "1"
    ? await readRosterLenses(c, resolvedModelId, rows.results.map((row) => row.game_id))
    : { lenses: new Map<string, RosterLens>(), model: null };
  const rosterPrimaryModelId = rosterArtifact.model?.primary_model_id || null;
  const rosterCompatible = Boolean(resolvedModelId && rosterPrimaryModelId === resolvedModelId);
  const responseRows = rows.results.map(({ prediction_json, ...row }) => {
    let prediction: Record<string, unknown> | null = null;
    let predictionIntegrity: "valid" | "invalid" = "invalid";
    let matchupRead: MatchupFactorRead = {
      factors: null,
      integrity: "unavailable",
      source: null,
      model_id: null,
      generated_at: null,
    };
    try {
      const parsed = JSON.parse(prediction_json) as unknown;
      const checked = parseForecastPrediction(parsed);
      prediction = checked.prediction;
      predictionIntegrity = checked.integrity;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "matchup_factors" in parsed) {
        const factors = parseForecastMatchupFactors((parsed as Record<string, unknown>).matchup_factors);
        matchupRead = {
          factors: factors.factors,
          integrity: factors.integrity,
          source: factors.factors ? "forecast_payload" : null,
          // The payload is stored on this exact forecast row, so a valid
          // embedded context belongs to the row's immutable model edition.
          model_id: factors.factors ? row.model_id : null,
          generated_at: factors.factors ? row.created_at : null,
        };
      } else {
        matchupRead = publishedFactors.get(row.game_id) || matchupRead;
      }
    } catch {
      // A malformed stored payload is withheld instead of failing the whole page.
    }
    if (matchupRead.integrity === "unavailable") {
      matchupRead = publishedFactors.get(row.game_id) || matchupRead;
    }
    return {
      ...row,
      source_time_valid: row.source_time_valid == null ? null : row.source_time_valid === 1,
      prediction,
      prediction_integrity: predictionIntegrity,
      matchup_factors: matchupRead.factors,
      matchup_factors_integrity: matchupRead.integrity,
      matchup_factors_source: matchupRead.source,
      matchup_factors_model_id: matchupRead.model_id,
      matchup_factors_generated_at: matchupRead.generated_at,
      matchup_factors_same_edition: matchupRead.factors && matchupRead.model_id
        ? matchupRead.model_id === row.model_id
        : null,
      ...(roster === "1" ? {
        roster_lens: (() => {
          const lens = rosterArtifact.lenses.get(row.game_id);
          return lens?.primary_model_id === row.model_id ? lens : null;
        })(),
      } : {}),
    };
  });
  const response = c.json({
    season,
    status,
    model,
    query: q || null,
    page,
    page_size: limit,
    total: Number(count?.total || 0),
    roster_model: roster === "1" ? rosterArtifact.model : undefined,
    roster_alignment: roster === "1" ? {
      resolved_model_id: resolvedModelId,
      roster_primary_model_id: rosterPrimaryModelId,
      compatible: rosterCompatible,
      status: rosterCompatible ? "matched" : rosterPrimaryModelId ? "model_mismatch" : "unavailable",
      matched_rows: responseRows.filter((row) => row.roster_lens != null).length,
    } : undefined,
    rows: responseRows,
  });
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
  } catch {
    const fallback = await publishedForecastFallback(c, { season, gameId, status, q, model, roster, page, limit });
    if (fallback) {
      if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, fallback.clone()).catch(() => undefined));
      return fallback;
    }
    return c.json({ error: "The live basketball forecasts are temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
});
