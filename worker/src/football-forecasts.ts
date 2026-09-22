import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { footballDb } from "./football-db";

type Bindings = Env;

const querySchema = z.object({
  season: z.coerce.number().int().min(2022).max(2035).default(2026),
  // A game-scoped read is the canonical handoff for matchup pages and keeps
  // callers from having to search a paginated slate before joining context.
  gameId: z.string().trim().regex(/^[A-Za-z0-9._-]{1,120}$/).optional(),
  status: z.enum(["all", "upcoming", "completed"]).default("all"),
  q: z.string().trim().max(120).optional(),
  model: z.union([
    z.literal("latest"),
    z.literal("all"),
    z.string().trim().regex(/^[A-Za-z0-9._-]{1,120}$/),
  ]).default("latest"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  meta: z.enum(["0", "1"]).default("0"),
});

export const footballForecasts = new Hono<{ Bindings: Bindings }>();

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type FootballReliabilityBin = {
  lower: number;
  upper: number;
  games: number;
  predicted: number | null;
  observed: number | null;
};

export type FootballModelSummary = {
  version: string | null;
  target_season: number | null;
  training_games: number | null;
  training_seasons: number[];
  latest_training_kickoff: string | null;
  cutoff: string | null;
  calibration: {
    season: number | null;
    games: number | null;
    binary_games: number | null;
    unscored_games: number | null;
    margin_half_width: number | null;
  } | null;
  evaluation: {
    season: number | null;
    games: number | null;
    binary_games: number | null;
    unscored_games: number | null;
    margin_mae: number | null;
    margin_rmse: number | null;
    total_mae: number | null;
    baseline_margin_mae: number | null;
    winner_accuracy: number | null;
    margin_pick_accuracy: number | null;
    brier: number | null;
    log_loss: number | null;
    interval_coverage: number | null;
    reliability: FootballReliabilityBin[];
  } | null;
};

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function boundedRate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function nonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function modelReliability(value: unknown): FootballReliabilityBin[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const lower = boundedRate(row.lower);
    const upper = boundedRate(row.upper);
    const games = nonNegativeInteger(row.games);
    if (lower == null || upper == null || lower > upper || games == null) return [];
    const predicted = row.predicted == null ? null : boundedRate(row.predicted);
    const observed = row.observed == null ? null : boundedRate(row.observed);
    if (row.predicted != null && predicted == null) return [];
    if (row.observed != null && observed == null) return [];
    return [{ lower, upper, games, predicted, observed }];
  });
}

/**
 * Publish the model evidence needed to interpret a forecast without exposing
 * fitted coefficients or the full training artifact. Missing or malformed
 * fields stay null, so a partial artifact cannot become a quality claim.
 */
export function parseFootballModelSummary(value: unknown, fallbackCutoff?: unknown): FootballModelSummary {
  let artifact: Record<string, unknown> = {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) artifact = parsed as Record<string, unknown>;
    } catch {
      // Keep the summary explicitly empty when the stored artifact is invalid.
    }
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    artifact = value as Record<string, unknown>;
  }
  const calibration = artifact.calibration && typeof artifact.calibration === "object" && !Array.isArray(artifact.calibration)
    ? artifact.calibration as Record<string, unknown>
    : null;
  const evaluation = artifact.evaluation && typeof artifact.evaluation === "object" && !Array.isArray(artifact.evaluation)
    ? artifact.evaluation as Record<string, unknown>
    : null;
  const trainingSeasons = Array.isArray(artifact.training_seasons)
    ? artifact.training_seasons.filter((season): season is number => typeof season === "number" && Number.isInteger(season) && season >= 1900 && season <= 2200)
    : [];
  return {
    version: typeof artifact.version === "string" ? artifact.version : null,
    target_season: nonNegativeInteger(artifact.target_season),
    training_games: nonNegativeInteger(artifact.training_games),
    training_seasons: trainingSeasons,
    latest_training_kickoff: typeof artifact.latest_training_kickoff === "string" ? artifact.latest_training_kickoff : null,
    cutoff: typeof artifact.cutoff === "string" ? artifact.cutoff : typeof fallbackCutoff === "string" ? fallbackCutoff : null,
    calibration: calibration ? {
      season: nonNegativeInteger(calibration.season),
      games: nonNegativeInteger(calibration.games),
      binary_games: nonNegativeInteger(calibration.binary_games),
      unscored_games: nonNegativeInteger(calibration.unscored_games),
      margin_half_width: nonNegativeNumber(calibration.margin_half_width),
    } : null,
    evaluation: evaluation ? {
      season: nonNegativeInteger(evaluation.season),
      games: nonNegativeInteger(evaluation.games),
      binary_games: nonNegativeInteger(evaluation.binary_games),
      unscored_games: nonNegativeInteger(evaluation.unscored_games),
      margin_mae: nonNegativeNumber(evaluation.margin_mae),
      margin_rmse: nonNegativeNumber(evaluation.margin_rmse),
      total_mae: nonNegativeNumber(evaluation.total_mae),
      baseline_margin_mae: nonNegativeNumber(evaluation.baseline_margin_mae),
      winner_accuracy: boundedRate(evaluation.winner_accuracy),
      margin_pick_accuracy: boundedRate(evaluation.margin_pick_accuracy),
      brier: nonNegativeNumber(evaluation.brier),
      log_loss: nonNegativeNumber(evaluation.log_loss),
      interval_coverage: boundedRate(evaluation.interval_coverage),
      reliability: modelReliability(evaluation.reliability),
    } : null,
  };
}

type FootballForecastIntegrity = "valid" | "invalid" | "unavailable";

function forecastValues(item: Record<string, unknown>, intervalWidth: number | null) {
  const rawFields = ["home_margin", "total", "home_win_probability"];
  const malformed = rawFields.some((field) => item[field] != null && asNumber(item[field]) === null);
  const homeMargin = asNumber(item.home_margin);
  const total = asNumber(item.total);
  const homeWinProbability = asNumber(item.home_win_probability);
  const complete = homeMargin !== null && total !== null && homeWinProbability !== null;
  const validProbability = homeWinProbability === null || (homeWinProbability >= 0 && homeWinProbability <= 1);
  const validTotal = total === null || total >= 0;
  if (malformed || !validProbability || !validTotal) {
    return {
      home_margin: null,
      total: null,
      home_win_probability: null,
      home_score: null,
      away_score: null,
      margin_low: null,
      margin_high: null,
      prediction_integrity: "invalid" as FootballForecastIntegrity,
    };
  }
  return {
    home_margin: homeMargin,
    total,
    home_win_probability: homeWinProbability,
    home_score: homeMargin === null || total === null ? null : round((total + homeMargin) / 2, 1),
    away_score: homeMargin === null || total === null ? null : round((total - homeMargin) / 2, 1),
    margin_low: homeMargin === null || intervalWidth === null ? null : round(homeMargin - intervalWidth, 1),
    margin_high: homeMargin === null || intervalWidth === null ? null : round(homeMargin + intervalWidth, 1),
    prediction_integrity: complete ? "valid" as FootballForecastIntegrity : "unavailable" as FootballForecastIntegrity,
  };
}

function round(value: number, digits: number) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function marginHalfWidth(artifactJson: string) {
  try {
    const artifact = JSON.parse(artifactJson) as {
      calibration?: { margin_half_width?: unknown };
      sigma?: unknown;
    };
    const calibrated = asNumber(artifact.calibration?.margin_half_width);
    if (calibrated !== null && calibrated >= 0) return calibrated;
    const sigma = asNumber(artifact.sigma);
    return sigma !== null && sigma >= 0 ? 1.281552 * sigma : null;
  } catch {
    return null;
  }
}

footballForecasts.get("/", zValidator("query", querySchema), async (c) => {
  const { season, gameId, status, q, model, page, limit, meta } = c.req.valid("query");
  const db = footballDb(c.env);
  const latestModelGameClause = gameId ? " AND p.game_id=?" : "";
  const latestModel = await db.prepare(
    `SELECT m.id,m.created_at,m.cutoff,m.artifact_json
       FROM football_models m
      WHERE EXISTS (
        SELECT 1 FROM football_predictions p
        JOIN football_games g ON g.id=p.game_id
        WHERE p.model_id=m.id AND g.season=?${latestModelGameClause}
      )
      ORDER BY m.created_at DESC,m.id DESC LIMIT 1`,
  ).bind(...(gameId ? [season, gameId] : [season])).first<{ id: string; created_at: string; cutoff: string; artifact_json: string }>();
  // Clients pin subsequent pages to the immutable model ID returned on page
  // zero. Resolve that edition's artifact as well so scores and calibrated
  // intervals do not disappear merely because `model` is no longer `latest`.
  const selectedModel = model === "latest"
    ? latestModel
    : model === "all"
      ? null
      : await db.prepare(
        "SELECT id,created_at,cutoff,artifact_json FROM football_models WHERE id=? LIMIT 1",
      ).bind(model).first<{ id: string; created_at: string; cutoff: string; artifact_json: string }>();

  if (meta === "1") {
    const now = new Date().toISOString();
    const [seasons, models, currentCoverage, modelArtifacts] = await db.batch([
      db.prepare("SELECT DISTINCT season FROM football_games ORDER BY season DESC"),
      db.prepare(
        `SELECT p.model_id,count(*) AS forecasts,
                MIN(p.created_at) AS first_created_at,MAX(p.created_at) AS last_created_at
           FROM football_predictions p
           JOIN football_games g ON g.id=p.game_id
          WHERE g.season=?
          GROUP BY p.model_id
          ORDER BY last_created_at DESC,model_id`,
      ).bind(season),
      db.prepare(
        `SELECT count(DISTINCT g.id) AS upcoming_games,
                count(DISTINCT CASE WHEN p.game_id IS NOT NULL THEN g.id END) AS forecast_games,
                count(DISTINCT CASE
                  WHEN p.game_id IS NULL
                   AND (lower(coalesce(g.home_division,'')) <> 'fbs'
                     OR lower(coalesce(g.away_division,'')) <> 'fbs')
                  THEN g.id END) AS outside_fbs_field,
                count(DISTINCT CASE
                  WHEN p.game_id IS NULL
                   AND lower(coalesce(g.home_division,'')) = 'fbs'
                   AND lower(coalesce(g.away_division,'')) = 'fbs'
                  THEN g.id END) AS eligible_missing_prediction
           FROM football_games g
           LEFT JOIN football_predictions p
             ON p.game_id=g.id AND p.model_id=?
          WHERE g.season=? AND g.completed=0 AND g.kickoff>?`,
      ).bind(latestModel?.id || "__no_registered_model__", season, now),
      // Keep the catalog useful for comparing successive prospective editions.
      // The artifact is parsed through parseFootballModelSummary below; raw
      // coefficients never cross this response boundary.
      db.prepare(
        `SELECT id,created_at,cutoff,artifact_json
           FROM football_models
          WHERE id IN (
            SELECT DISTINCT p.model_id
              FROM football_predictions p
              JOIN football_games g ON g.id=p.game_id
             WHERE g.season=?
          )`,
      ).bind(season),
    ]);
    const artifactsById = new Map(
      (modelArtifacts?.results || []).flatMap((row) => {
        const item = row as Record<string, unknown>;
        if (typeof item.id !== "string" || typeof item.artifact_json !== "string") return [];
        return [[item.id, item] as const];
      }),
    );
    const metadata = models.results.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        ...item,
        forecasts: Number(item.forecasts || 0),
        model_summary: artifactsById.has(String(item.model_id))
          ? parseFootballModelSummary(
              artifactsById.get(String(item.model_id))!.artifact_json,
              artifactsById.get(String(item.model_id))!.cutoff,
            )
          : null,
      };
    });
    const latestSummary = latestModel
      ? parseFootballModelSummary(latestModel.artifact_json, latestModel.cutoff)
      : null;
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      seasons: seasons.results.map((row) => Number((row as { season: number }).season)),
      latest_model: latestModel ? {
        model_id: latestModel.id,
        created_at: latestModel.created_at,
        cutoff: latestModel.cutoff,
        model_summary: latestSummary,
      } : null,
      coverage: (() => {
        const row = (currentCoverage.results[0] || {}) as Record<string, unknown>;
        return {
          upcoming_games: Number(row.upcoming_games || 0),
          forecast_games: Number(row.forecast_games || 0),
          outside_fbs_field: Number(row.outside_fbs_field || 0),
          eligible_missing_prediction: Number(row.eligible_missing_prediction || 0),
        };
      })(),
      models: metadata,
    });
  }

  const clauses = ["g.season=?"];
  const binds: Array<string | number> = [season];
  if (gameId) {
    clauses.push("p.game_id=?");
    binds.push(gameId);
  }
  if (status === "upcoming") {
    clauses.push("g.completed=0", "g.kickoff>?");
    binds.push(new Date().toISOString());
  } else if (status === "completed") {
    clauses.push("g.completed=1");
  }
  if (q) {
    const search = `%${escapeLike(q)}%`;
    clauses.push("(g.home_name LIKE ? ESCAPE '\\' OR g.away_name LIKE ? ESCAPE '\\')");
    binds.push(search, search);
  }
  if (model === "latest") {
    if (!latestModel) {
      c.header("Cache-Control", "public, max-age=300");
      return c.json({ season, status, model, query: q || null, page, page_size: limit, total: 0, rows: [] });
    }
    clauses.push("p.model_id=?");
    binds.push(latestModel.id);
  } else if (model !== "all") {
    clauses.push("p.model_id=?");
    binds.push(model);
  }
  const where = clauses.join(" AND ");
  const count = await db.prepare(
    `SELECT count(*) AS total FROM football_predictions p JOIN football_games g ON g.id=p.game_id WHERE ${where}`,
  ).bind(...binds).first<{ total: number }>();
  const rows = await db.prepare(
    `SELECT p.game_id,p.model_id,p.created_at,p.home_margin,p.total,p.home_win_probability,
            g.season,g.kickoff,g.home_id,g.away_id,g.home_name,g.away_name,
            g.home_conference,g.away_conference,g.home_division,g.away_division,
            g.home_score,g.away_score,g.completed,g.neutral,g.week,g.venue,g.time_tbd
       FROM football_predictions p JOIN football_games g ON g.id=p.game_id
      WHERE ${where}
      ORDER BY g.kickoff ASC,p.created_at DESC,p.model_id ASC
      LIMIT ? OFFSET ?`,
  ).bind(...binds, limit, page * limit).all();
  const intervalWidth = selectedModel
    ? marginHalfWidth(selectedModel.artifact_json)
    : null;
  // Keep the edition selected by the query explicit at the response level.
  // `model=latest` is a query alias, so clients comparing predictions with
  // market observations must not infer an edition from that alias or from a
  // single row's model_id. `all` only reports an ID when its bounded page
  // happens to contain one edition.
  const pageModelIds = new Set(
    rows.results.flatMap((row) => {
      const modelId = (row as Record<string, unknown>).model_id;
      return typeof modelId === "string" && modelId.length ? [modelId] : [];
    }),
  );
  const resolvedModelId = model === "latest"
    ? latestModel?.id || null
    : model === "all"
      ? pageModelIds.size === 1 ? [...pageModelIds][0] : null
      : selectedModel?.id || null;
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    season,
    status,
    model,
    query: q || null,
    page,
    page_size: limit,
    total: Number(count?.total || 0),
    resolved_model_id: resolvedModelId,
    latest_model: latestModel ? {
      model_id: latestModel.id,
      created_at: latestModel.created_at,
      cutoff: latestModel.cutoff,
      model_summary: parseFootballModelSummary(latestModel.artifact_json, latestModel.cutoff),
    } : null,
    rows: rows.results.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        ...item,
        ...forecastValues(item, intervalWidth),
      };
    }),
  });
});
