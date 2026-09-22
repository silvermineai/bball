export type LowerFootballDivision = "fcs" | "d2" | "d3";

export type LowerFootballResult = {
  game_id: string;
  kickoff: string;
  week: number | null;
  scope_division: LowerFootballDivision;
  home_id: string;
  home_name: string;
  home_division: string | null;
  away_id: string;
  away_name: string;
  away_division: string | null;
  home_score: number | null;
  away_score: number | null;
  neutral: boolean;
  score_complete: boolean;
};

export type LowerFootballPrediction = {
  home_margin: number;
  total: number;
  home_score: number;
  away_score: number;
  home_win_probability: number;
  margin_low: number;
  margin_high: number;
};

export type LowerFootballForecast = Omit<LowerFootballResult, "home_division" | "away_division" | "home_score" | "away_score" | "score_complete"> & {
  model_id: string;
  prediction: LowerFootballPrediction;
};

export type LowerFootballForecastSort = "kickoff" | "home_win_probability" | "home_margin" | "uncertainty";

export type LowerFootballForecastExplanation = {
  home_rating: number | null;
  away_rating: number | null;
  rating_gap: number | null;
  venue: "home_field" | "neutral";
};

export function lowerDivisionSelection(value: LowerFootballDivision | undefined): LowerFootballDivision {
  if (value === "fcs") return "fcs";
  return value === "d3" ? "d3" : "d2";
}

export type LowerFootballTeam = {
  team_id: string;
  team: string;
  division: LowerFootballDivision;
  games: number;
  wins: number;
  losses: number;
  points_for: number;
  points_against: number;
};

export type LowerFootballRating = {
  team_id: string;
  team: string;
  division: LowerFootballDivision;
  rating: number;
  rank: number;
};

export type LowerFootballModel = {
  id: string;
  version: string;
  division: LowerFootballDivision;
  target_season: number;
  cutoff: string;
  training_seasons: number[];
  training_games: number;
  calibration_season: number;
  calibration: { games: number; margin_half_width: number };
  ratings: LowerFootballRating[];
  limitations: string[];
};

export type LowerFootballResults = {
  schema_version: number;
  sport: "football";
  season: number;
  generated_at: string;
  scope: string;
  coverage: Record<LowerFootballDivision, { games: number; score_complete: number; scores_missing: number; upcoming_games?: number; forecast_games?: number }>;
  teams: Record<LowerFootballDivision, LowerFootballTeam[]>;
  rows: LowerFootballResult[];
  models: Partial<Record<LowerFootballDivision, LowerFootballModel | null>>;
  forecasts: Record<LowerFootballDivision, LowerFootballForecast[]>;
  limitations: string[];
  source?: { dataset?: string; season?: number; url?: string; fetched_at?: string; sha256?: string; last_modified?: string | null };
};

const divisions = new Set<LowerFootballDivision>(["fcs", "d2", "d3"]);
const archiveDivisions = ["fcs", "d2", "d3"] as const;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

function validRow(value: unknown): value is LowerFootballResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.game_id === "string"
    && typeof row.kickoff === "string"
    && divisions.has(row.scope_division as LowerFootballDivision)
    && typeof row.home_id === "string"
    && typeof row.home_name === "string"
    && typeof row.away_id === "string"
    && typeof row.away_name === "string"
    && typeof row.score_complete === "boolean"
    && (!row.score_complete || (finite(row.home_score) != null && finite(row.away_score) != null))
    && (row.home_score == null || finite(row.home_score) != null)
    && (row.away_score == null || finite(row.away_score) != null);
}

function validPrediction(value: unknown): value is LowerFootballPrediction {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return ["home_margin", "total", "home_score", "away_score", "home_win_probability", "margin_low", "margin_high"]
    .every((key) => finite(row[key]) != null)
    && Number(row.home_win_probability) >= 0
    && Number(row.home_win_probability) <= 1
    && Number(row.total) >= 0;
}

function validForecast(value: unknown): value is LowerFootballForecast {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.game_id === "string"
    && typeof row.kickoff === "string"
    && divisions.has(row.scope_division as LowerFootballDivision)
    && typeof row.home_id === "string"
    && typeof row.home_name === "string"
    && typeof row.away_id === "string"
    && typeof row.away_name === "string"
    && typeof row.model_id === "string"
    && validPrediction(row.prediction);
}

function validModel(value: unknown, division: LowerFootballDivision, season: number): value is LowerFootballModel {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const calibration = row.calibration as Record<string, unknown> | undefined;
  const ratingsRaw = Array.isArray(row.ratings) ? row.ratings : [];
  const ratings = ratingsRaw.filter((item): item is LowerFootballRating => {
    if (!item || typeof item !== "object") return false;
    const rating = item as Record<string, unknown>;
    return typeof rating.team_id === "string" && typeof rating.team === "string"
      && rating.division === division && Number.isInteger(rating.rank) && Number(rating.rank) > 0
      && finite(rating.rating) != null;
  });
  // A filtered rating list can look healthy while silently dropping a
  // malformed row or a duplicate rank. A model is a ranked publication, so
  // fail closed on any invalid row and keep team/rank identities one-to-one.
  const teamIds = new Set(ratings.map((rating) => rating.team_id));
  const ranks = new Set(ratings.map((rating) => rating.rank));
  return typeof row.id === "string" && typeof row.version === "string"
    && row.division === division && typeof row.target_season === "number"
    && row.target_season === season
    && typeof row.cutoff === "string" && Array.isArray(row.training_seasons)
    && row.training_seasons.every((season) => Number.isInteger(season))
    && Number.isInteger(row.training_games) && Number.isInteger(row.calibration_season)
    && !!calibration && Number.isInteger(calibration.games)
    && finite(calibration.margin_half_width) != null
    && Array.isArray(row.limitations) && row.limitations.every((item) => typeof item === "string")
    && ratingsRaw.length > 0 && ratings.length === ratingsRaw.length
    && teamIds.size === ratings.length && ranks.size === ratings.length;
}

/** Validate the checked-in archive and fail closed on malformed rows. */
export function validateLowerFootballResults(value: unknown): LowerFootballResults {
  if (!value || typeof value !== "object") throw new Error("Lower-division football archive is malformed.");
  const raw = value as Record<string, unknown>;
  if (raw.sport !== "football" || (raw.schema_version !== 1 && raw.schema_version !== 2) || typeof raw.season !== "number") {
    throw new Error("Lower-division football archive has an unsupported edition.");
  }
  const rows = Array.isArray(raw.rows) ? raw.rows.filter(validRow) : [];
  const teams = { fcs: [], d2: [], d3: [] } as Record<LowerFootballDivision, LowerFootballTeam[]>;
  for (const division of archiveDivisions) {
    const source = raw.teams && typeof raw.teams === "object" ? (raw.teams as Record<string, unknown>)[division] : [];
    teams[division] = Array.isArray(source) ? source.filter((team): team is LowerFootballTeam => {
      if (!team || typeof team !== "object") return false;
      const row = team as Record<string, unknown>;
      return typeof row.team_id === "string" && typeof row.team === "string" && row.division === division
        && ["games", "wins", "losses", "points_for", "points_against"].every((key) => finite(row[key]) != null);
    }) : [];
  }
  const coverage = Object.fromEntries(archiveDivisions.map((division) => [division, {
    games: 0,
    score_complete: 0,
    scores_missing: 0,
    upcoming_games: 0,
    forecast_games: 0,
  }])) as LowerFootballResults["coverage"];
  for (const row of rows) {
    coverage[row.scope_division].games += 1;
    coverage[row.scope_division][row.score_complete ? "score_complete" : "scores_missing"] += 1;
  }
  const models = {} as LowerFootballResults["models"];
  const forecasts = { fcs: [], d2: [], d3: [] } as LowerFootballResults["forecasts"];
  for (const division of archiveDivisions) {
    const sourceModel = raw.models && typeof raw.models === "object" ? (raw.models as Record<string, unknown>)[division] : null;
    if (validModel(sourceModel, division, raw.season)) models[division] = sourceModel;
    const sourceForecasts = raw.forecasts && typeof raw.forecasts === "object" ? (raw.forecasts as Record<string, unknown>)[division] : [];
    forecasts[division] = Array.isArray(sourceForecasts)
      ? sourceForecasts.filter((item): item is LowerFootballForecast => validForecast(item) && item.scope_division === division)
      : [];
    coverage[division].upcoming_games = Number(raw.coverage && typeof raw.coverage === "object" && (raw.coverage as Record<string, unknown>)[division] && typeof (raw.coverage as Record<string, unknown>)[division] === "object" ? ((raw.coverage as Record<string, unknown>)[division] as Record<string, unknown>).upcoming_games || 0 : 0);
    coverage[division].forecast_games = forecasts[division].length;
  }
  return {
    schema_version: typeof raw.schema_version === "number" ? raw.schema_version : 1,
    sport: "football",
    season: raw.season,
    generated_at: typeof raw.generated_at === "string" ? raw.generated_at : "",
    scope: typeof raw.scope === "string" ? raw.scope : "D2/D3 completed schedule results",
    coverage,
    teams,
    rows: rows.sort((a, b) => b.kickoff.localeCompare(a.kickoff) || b.game_id.localeCompare(a.game_id)),
    models,
    forecasts,
    limitations: Array.isArray(raw.limitations) ? raw.limitations.filter((item): item is string => typeof item === "string") : [],
    source: raw.source && typeof raw.source === "object" ? raw.source as LowerFootballResults["source"] : undefined,
  };
}

export function lowerResultsForDivision(archive: LowerFootballResults, division: LowerFootballDivision) {
  return archive.rows.filter((row) => row.scope_division === division);
}

/**
 * Select and order upcoming forecasts without ever crossing the archive's
 * exact-division boundary.  The uncertainty sort uses the published margin
 * interval; it does not invent a confidence score from the point estimate.
 */
export function lowerForecastsForDivision(
  archive: LowerFootballResults,
  division: LowerFootballDivision,
  query = "",
  sort: LowerFootballForecastSort = "kickoff",
) {
  const needle = query.trim().toLowerCase();
  const rows = archive.forecasts[division].filter((row) =>
    !needle || `${row.home_name} ${row.away_name} ${row.game_id}`.toLowerCase().includes(needle),
  );
  const value = (row: LowerFootballForecast) => {
    if (sort === "home_win_probability") return row.prediction.home_win_probability;
    if (sort === "home_margin") return row.prediction.home_margin;
    if (sort === "uncertainty") return row.prediction.margin_high - row.prediction.margin_low;
    return Date.parse(row.kickoff);
  };
  return [...rows].sort((left, right) => {
    const leftValue = value(left);
    const rightValue = value(right);
    if (sort === "kickoff" || sort === "uncertainty") {
      return leftValue - rightValue || left.game_id.localeCompare(right.game_id);
    }
    return rightValue - leftValue || left.game_id.localeCompare(right.game_id);
  });
}

/** The interval width is the model's published uncertainty signal in points. */
export function lowerForecastUncertainty(row: LowerFootballForecast) {
  return row.prediction.margin_high - row.prediction.margin_low;
}

/**
 * Expose the retained model inputs behind a lower-division forecast.
 * Ratings are source-derived model coefficients, not player or publisher
 * rankings. Missing team coefficients remain unavailable rather than being
 * replaced with zero.
 */
export function lowerForecastExplanation(
  row: LowerFootballForecast,
  model: LowerFootballModel | null | undefined,
): LowerFootballForecastExplanation {
  const homeRating = model?.ratings.find((rating) => rating.team_id === row.home_id)?.rating ?? null;
  const awayRating = model?.ratings.find((rating) => rating.team_id === row.away_id)?.rating ?? null;
  return {
    home_rating: homeRating,
    away_rating: awayRating,
    rating_gap: homeRating != null && awayRating != null ? Number((homeRating - awayRating).toFixed(2)) : null,
    venue: row.neutral ? "neutral" : "home_field",
  };
}

export function lowerForecastCsvRows(rows: LowerFootballForecast[]) {
  return rows.map((row) => [
    row.scope_division,
    row.game_id,
    row.kickoff,
    row.away_name,
    row.home_name,
    row.neutral ? "neutral" : "home field",
    row.model_id,
    row.prediction.away_score,
    row.prediction.home_score,
    row.prediction.total,
    row.prediction.home_margin,
    row.prediction.home_win_probability,
    row.prediction.margin_low,
    row.prediction.margin_high,
    lowerForecastUncertainty(row),
  ] as (string | number | null)[]);
}
