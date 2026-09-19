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
  base_margin: number;
  roster_margin: number;
  margin_delta: number;
  home_predicted_net: number;
  away_predicted_net: number;
};

type RosterModelArtifact = {
  version?: unknown;
  generated_at?: unknown;
  coverage?: { scenario_games?: unknown; current_predicted_teams?: unknown };
  evaluation?: { held_out_transition?: unknown; improvement_vs_prior_net?: unknown; mae?: unknown };
  scenarios?: unknown;
};

async function readRosterLenses(c: Context<{ Bindings: Bindings }>) {
  if (!c.env.ASSETS) return { lenses: new Map<string, RosterLens>(), model: null };
  try {
    const response = await withTimeout(
      c.env.ASSETS.fetch(new Request(new URL("/data/basketball/roster-model.json", c.req.url))),
      2000,
    );
    if (!response.ok) return { lenses: new Map<string, RosterLens>(), model: null };
    const artifact = await response.json() as RosterModelArtifact;
    const rows = Array.isArray(artifact.scenarios) ? artifact.scenarios : [];
    const lenses = new Map<string, RosterLens>();
    for (const value of rows) {
      if (!value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      const fields = ["game_id", "home_id", "away_id"];
      if (fields.some((field) => typeof row[field] !== "string")) continue;
      const numbers = ["base_margin", "roster_margin", "margin_delta", "home_predicted_net", "away_predicted_net"];
      if (numbers.some((field) => typeof row[field] !== "number" || !Number.isFinite(row[field] as number))) continue;
      const lens = row as unknown as RosterLens;
      lenses.set(lens.game_id, lens);
    }
    const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
    const coverage = artifact.coverage || {};
    const evaluation = artifact.evaluation || {};
    return {
      lenses,
      model: {
        version: typeof artifact.version === "string" ? artifact.version : null,
        generated_at: typeof artifact.generated_at === "string" ? artifact.generated_at : null,
        scenario_games: number(coverage.scenario_games),
        current_predicted_teams: number(coverage.current_predicted_teams),
        held_out_transition: number(evaluation.held_out_transition),
        improvement_vs_prior_net: number(evaluation.improvement_vs_prior_net),
        mae: number(evaluation.mae),
      },
    };
  } catch {
    return { lenses: new Map<string, RosterLens>(), model: null };
  }
}

type PublishedForecastOverview = {
  season?: unknown;
  generated_at?: unknown;
  model?: { id?: unknown };
  upcoming?: unknown;
};

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
        const prediction = game.prediction && typeof game.prediction === "object" && !Array.isArray(game.prediction)
          ? game.prediction
          : game.fallback_prediction && typeof game.fallback_prediction === "object" && !Array.isArray(game.fallback_prediction)
            ? game.fallback_prediction
            : null;
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
          prediction,
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
                json_extract(artifact_json,'$.calibration.season') AS calibration_season,
                json_extract(artifact_json,'$.calibration.games') AS calibration_games,
                json_extract(artifact_json,'$.calibration.margin_half_width') AS margin_half_width,
                json_extract(artifact_json,'$.evaluation.season') AS evaluation_season,
                json_extract(artifact_json,'$.evaluation.games') AS evaluation_games,
                json_extract(artifact_json,'$.evaluation.winner_accuracy') AS evaluation_winner_accuracy,
                json_extract(artifact_json,'$.evaluation.margin_mae') AS evaluation_margin_mae,
                json_extract(artifact_json,'$.evaluation.baseline_margin_mae') AS evaluation_baseline_margin_mae,
                json_extract(artifact_json,'$.evaluation.interval_coverage') AS evaluation_interval_coverage
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
        calibration_season: item.calibration_season == null ? null : Number(item.calibration_season),
        calibration_games: item.calibration_games == null ? null : Number(item.calibration_games),
        margin_half_width: item.margin_half_width == null ? null : Number(item.margin_half_width),
        evaluation_season: item.evaluation_season == null ? null : Number(item.evaluation_season),
        evaluation_games: item.evaluation_games == null ? null : Number(item.evaluation_games),
        evaluation_winner_accuracy: item.evaluation_winner_accuracy == null ? null : Number(item.evaluation_winner_accuracy),
        evaluation_margin_mae: item.evaluation_margin_mae == null ? null : Number(item.evaluation_margin_mae),
        evaluation_baseline_margin_mae: item.evaluation_baseline_margin_mae == null ? null : Number(item.evaluation_baseline_margin_mae),
        evaluation_interval_coverage: item.evaluation_interval_coverage == null ? null : Number(item.evaluation_interval_coverage),
      };
    });
    // Forecast rows can outlive their model metadata during a replay. Keep
    // metadata-backed editions first so `latest` in the catalog is usable.
    modelsWithMetadata.sort((left, right) => {
      const leftRecord = left as Record<string, unknown>;
      const rightRecord = right as Record<string, unknown>;
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
        LEFT JOIN bb_models m_latest ON m_latest.id=f_latest.model_id
       WHERE g_latest.season=?
       GROUP BY f_latest.model_id
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
  const rosterArtifact = roster === "1" ? await readRosterLenses(c) : { lenses: new Map<string, RosterLens>(), model: null };
  const response = c.json({
    season,
    status,
    model,
    query: q || null,
    page,
    page_size: limit,
    total: Number(count?.total || 0),
    roster_model: roster === "1" ? rosterArtifact.model : undefined,
    rows: rows.results.map(({ prediction_json, ...row }) => {
      let prediction: Record<string, unknown> | null = null;
      try {
        const parsed = JSON.parse(prediction_json) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          prediction = parsed as Record<string, unknown>;
        }
      } catch {
        // A malformed stored payload is withheld instead of failing the whole page.
      }
      return {
        ...row,
        source_time_valid: row.source_time_valid == null ? null : row.source_time_valid === 1,
        prediction,
        ...(roster === "1" ? { roster_lens: rosterArtifact.lenses.get(row.game_id) || null } : {}),
      };
    }),
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
