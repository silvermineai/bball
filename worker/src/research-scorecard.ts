import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { researchDb } from "./research-db";

type Sport = "football" | "basketball";
type Bindings = Env;
type Json = Record<string, unknown>;

const SPORTS: Sport[] = ["football", "basketball"];
const querySchema = z.object({
  sport: z.enum(["football", "basketball", "all"]).default("all"),
  season: z.coerce.number().int().min(2018).max(2035).optional(),
  q: z.string().trim().max(120).optional(),
  status: z.enum([
    "all",
    "scheduled",
    "awaiting_result",
    "settled",
    "excluded",
    "final_missing_scores",
    "inconsistent_final",
  ]).default("all"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  limit: z.coerce.number().int().min(1).max(5000).default(5000),
  /** Restrict selection to one immutable forecast edition for live comparisons. */
  model: z.string().trim().regex(/^[A-Za-z0-9._-]{1,120}$/).optional(),
});

export const researchScorecard = new Hono<{ Bindings: Bindings }>();

const CACHE_TTL = 60;
const DB_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("research scorecard query timed out")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function edgeCache() {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

const POLICY = "first-eligible-registration-v1";
const LIMITATION = [
  "Registration times are local pipeline observations, not independently notarized publication times.",
  "Changed participants or start times, unconfirmed start times and late registrations are excluded.",
  "Quotes older than 24 hours when captured are excluded; last observed quotes may still be stale today.",
  "Settlements use latest source finals, including overtime; source corrections can revise reported scores.",
  "Source finals are not official bookmaker settlements. Direction results are hypothetical, without execution, odds or fees.",
];

function object(value: unknown): Json | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Json;
}

function parse(value: unknown): Json | null {
  if (typeof value !== "string") return object(value);
  try { return object(JSON.parse(value)); } catch { return null; }
}

type EstimateType = "primary" | "cold_start" | "unknown";

/** Keep exploratory cold-start rows out of the primary-model performance label. */
function estimateType(payload: Json): EstimateType {
  const prediction = object(payload.prediction);
  if (!prediction) return "unknown";
  if (prediction.estimate_type === "cold_start") return "cold_start";
  if (prediction.estimate_type === undefined || prediction.estimate_type === "primary") return "primary";
  return "unknown";
}

function number(value: unknown): number | null {
  // JSON null, booleans and blank strings are missing evidence, not zero.
  // Number(null), Number(false) and Number("") all coerce to 0, which could
  // otherwise turn an incomplete final or prediction into a valid metric.
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function probability(value: unknown): number | null {
  const candidate = number(value);
  return candidate !== null && candidate >= 0 && candidate <= 1 ? candidate : null;
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function iso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/**
 * Provider payloads have used both `Draft Kings` and `DraftKings` for the
 * same bookmaker. Treat spacing, punctuation and case as presentation details
 * when selecting and aggregating quotes, while retaining the source label in
 * the returned comparison. This prevents one bookmaker from being counted as
 * two market references without inventing or merging different prices.
 */
export function marketBookmakerKey(value: unknown): string {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized || raw;
}

/** Return a winner-pick result, leaving an exactly even probability unscored. */
export function winnerPickCorrect(probabilityValue: number | null, homeWon: boolean): boolean | null {
  if (probabilityValue === null || probabilityValue === 0.5) return null;
  return (probabilityValue > 0.5) === homeWon;
}

function eligibility(row: Json, state: Json | null): string | null {
  if (!state) return "missing_schedule";
  const payload = parse(row.payload_json) || {};
  const homeId = String(payload.home_id ?? "");
  const awayId = String(payload.away_id ?? "");
  if (homeId !== String(state.home_id ?? "") || awayId !== String(state.away_id ?? "")) return "participants_changed";
  if (bool(row.time_tbd) || bool(state.time_tbd)) return "unconfirmed_start";
  if (String(row.starts_at) !== String(state.starts_at ?? "")) return "schedule_changed";
  if (String(row.registered_at) >= String(row.starts_at)) return "registered_after_start";
  if (String(row.generated_at) > String(row.registered_at) || String(payload.model_cutoff ?? "") > String(row.generated_at)) return "invalid_clock";
  return null;
}

function finalStatus(state: Json | null, now: string): string {
  if (!state) return "excluded";
  const starts = iso(state.starts_at);
  if (!starts) return "excluded";
  if (bool(state.completed)) {
    if (number(state.home_score) === null || number(state.away_score) === null) return "final_missing_scores";
    if (starts > now) return "inconsistent_final";
    return "settled";
  }
  return starts <= now ? "awaiting_result" : "scheduled";
}

type MarketRejection =
  | "forecast_excluded"
  | "invalid_payload"
  | "participants_changed"
  | "schedule_changed"
  | "invalid_clock"
  | "captured_before_registration"
  | "captured_after_start"
  | "updated_after_capture"
  | "captured_in_future"
  | "updated_after_start"
  | "stale_at_capture"
  | "invalid_prices"
  | "missing_model_output"
  | "unsupported_market";

type MarketComparisonReadiness = {
  selected_game_observations: number;
  eligible_observations: number;
  comparable_observations: number;
  selected_comparisons: number;
  rejection_counts: Partial<Record<MarketRejection, number>>;
};

function marketExclusion(quote: Json, prediction: Json, state: Json, now: string): MarketRejection | null {
  const q = parse(quote.payload_json) || {};
  // Source adapters use both millisecond and microsecond ISO spellings. Work
  // in normalized instants so equivalent clocks do not become a false
  // schedule mismatch during forecast-versus-market comparison.
  const starts = iso(prediction.starts_at);
  const stateStarts = iso(state.starts_at);
  if (!starts || !stateStarts) return "invalid_clock";
  const boundary = new Date(Math.min(Date.parse(starts), Date.parse(stateStarts))).toISOString();
  const captured = String(quote.captured_at);
  const updated = String(quote.updated_at);
  const capturedTime = Date.parse(captured);
  const updatedTime = Date.parse(updated);
  const nowTime = Date.parse(now);
  const boundaryTime = Date.parse(boundary);
  const registeredTime = Date.parse(String(prediction.registered_at));
  const age = capturedTime - updatedTime;
  if (!Object.keys(q).length) return "invalid_payload";
  if (String(q.home_id ?? "") !== String(state.home_id ?? "") || String(q.away_id ?? "") !== String(state.away_id ?? "")) return "participants_changed";
  if (iso(q.starts_at) !== boundary) return "schedule_changed";
  if (![capturedTime, updatedTime, nowTime, boundaryTime, registeredTime].every(Number.isFinite)) return "invalid_clock";
  if (capturedTime < registeredTime) return "captured_before_registration";
  if (capturedTime >= boundaryTime) return "captured_after_start";
  if (updatedTime > capturedTime) return "updated_after_capture";
  if (capturedTime > nowTime) return "captured_in_future";
  if (updatedTime >= boundaryTime) return "updated_after_start";
  if (age > 86400000) return "stale_at_capture";
  return null;
}

function comparisonExclusion(prediction: Json, quote: Json): MarketRejection | null {
  const p = parse(prediction.payload_json)?.prediction as Json | undefined;
  const q = parse(quote.payload_json);
  if (!p || !q) return "invalid_payload";
  const market = String(quote.market);
  if (market !== "spreads" && market !== "totals" && market !== "h2h") return "unsupported_market";
  const first = number(market === "totals" ? q.over_price : q.home_price);
  const second = number(market === "totals" ? q.under_price : q.away_price);
  if (first === null || second === null || first <= 1 || second <= 1) return "invalid_prices";
  if (market === "spreads") return number(p.home_margin) !== null && number(q.line) !== null ? null : "missing_model_output";
  if (market === "totals") return number(p.total) !== null && number(q.line) !== null ? null : "missing_model_output";
  return probability(p.home_win_probability) !== null ? null : "missing_model_output";
}

function compare(prediction: Json, quote: Json, state: Json): Json | null {
  const p = parse(prediction.payload_json)?.prediction as Json | undefined;
  const q = parse(quote.payload_json);
  if (!p || !q) return null;
  const market = String(quote.market);
  const first = number(market === "totals" ? q.over_price : q.home_price);
  const second = number(market === "totals" ? q.under_price : q.away_price);
  const line = number(q.line);
  if (!first || !second || first <= 1 || second <= 1) return null;
  const output: Json = {
    provider: quote.provider,
    bookmaker: quote.bookmaker,
    market,
    captured_at: quote.captured_at,
    updated_at: quote.updated_at,
    line,
    model_difference: null,
    market_home_probability: null,
    market_overround: 1 / first + 1 / second - 1,
  };
  const modelMargin = number(p.home_margin);
  const modelTotal = number(p.total);
  const modelWin = probability(p.home_win_probability);
  if (market === "spreads" && modelMargin !== null && line !== null) output.model_difference = modelMargin + line;
  else if (market === "totals" && modelTotal !== null && line !== null) output.model_difference = modelTotal - line;
  else if (market === "h2h" && modelWin !== null) {
    output.market_home_probability = (1 / first) / (1 / first + 1 / second);
    output.model_difference = modelWin - Number(output.market_home_probability);
  } else return null;
  const homeScore = number(state.home_score);
  const awayScore = number(state.away_score);
  if (bool(state.completed) && homeScore !== null && awayScore !== null) {
    const margin = homeScore - awayScore;
    const total = homeScore + awayScore;
    if (market === "spreads" || market === "totals") {
      const actual = market === "spreads" ? margin : total;
      const estimate = market === "spreads" ? modelMargin : modelTotal;
      const baseline = market === "spreads" ? -Number(line) : Number(line);
      if (estimate !== null) {
        output.model_absolute_error = Math.abs(estimate - actual);
        output.market_absolute_error = Math.abs(baseline - actual);
        const outcome = actual - baseline;
        output.direction_result = Math.abs(Number(output.model_difference)) < 1e-9 ? "pass" : Math.abs(outcome) < 1e-9 ? "push" : Number(output.model_difference) * outcome > 0 ? "win" : "loss";
      }
    } else if (market === "h2h" && margin !== 0 && modelWin !== null) {
      const outcome = margin > 0 ? 1 : 0;
      output.model_brier = (modelWin - outcome) ** 2;
      output.market_brier = (Number(output.market_home_probability) - outcome) ** 2;
      const modelPick = winnerPickCorrect(modelWin, outcome === 1);
      const marketPick = winnerPickCorrect(Number(output.market_home_probability), outcome === 1);
      if (modelPick !== null) output.model_winner_correct = modelPick;
      if (marketPick !== null) output.market_winner_correct = marketPick;
    }
  }
  return output;
}

function metrics(rows: Json[]): Json {
  const settled = rows.filter((row) => row.status === "settled");
  const binary = settled.filter((row) => {
    const margin = number(row.actual_margin);
    return margin !== null && margin !== 0;
  });
  const marginErrors = settled.flatMap((row) => number(row.home_margin) !== null && number(row.actual_margin) !== null ? [Math.abs(Number(row.home_margin) - Number(row.actual_margin))] : []);
  const totalErrors = settled.flatMap((row) => number(row.total) !== null && number(row.actual_total) !== null ? [Math.abs(Number(row.total) - Number(row.actual_total))] : []);
  const picks = binary.filter((row) => probability(row.home_win_probability) !== null && probability(row.home_win_probability) !== 0.5);
  const winner = picks.map((row) => (Number(probability(row.home_win_probability)) > 0.5) === (Number(row.actual_margin) > 0) ? 1 : 0);
  const brier = binary.flatMap((row) => probability(row.home_win_probability) !== null && number(row.actual_margin) !== null ? [(Number(probability(row.home_win_probability)) - (Number(row.actual_margin) > 0 ? 1 : 0)) ** 2] : []);
  const logLoss = binary.flatMap((row) => {
    const p = probability(row.home_win_probability);
    const margin = number(row.actual_margin);
    if (p === null || margin === null) return [];
    const likelihood = margin > 0 ? p : 1 - p;
    return [-Math.log(Math.max(1e-12, Math.min(1 - 1e-12, likelihood)))];
  });
  const interval = settled.filter((row) => {
    const low = number(row.margin_low);
    const high = number(row.margin_high);
    return low !== null && high !== null && low <= high && number(row.actual_margin) !== null;
  });
  const reliability = Array.from({ length: 10 }, (_, index) => {
    const lower = index / 10;
    const upper = (index + 1) / 10;
    const bucket = binary.filter((row) => {
      const candidate = probability(row.home_win_probability);
      return candidate !== null && candidate >= lower && (index === 9 ? candidate <= upper : candidate < upper);
    });
    const predicted = bucket.flatMap((row) => probability(row.home_win_probability) === null ? [] : [Number(probability(row.home_win_probability))]);
    const observed = bucket.flatMap((row) => number(row.actual_margin) === null ? [] : [Number(row.actual_margin) > 0 ? 1 : 0]);
    return bucket.length ? { lower, upper, games: bucket.length, predicted: mean(predicted), observed: mean(observed) } : null;
  }).filter((bin): bin is { lower: number; upper: number; games: number; predicted: number | null; observed: number | null } => bin !== null);
  const calibratedGames = reliability.reduce((sum, bin) => sum + bin.games, 0);
  return {
    games: settled.length,
    binary_games: binary.length,
    margin_mae: mean(marginErrors),
    total_mae: mean(totalErrors),
    winner_accuracy: mean(winner),
    winner_picks: picks.length,
    brier: mean(brier),
    log_loss: mean(logLoss),
    interval_games: interval.length,
    interval_coverage: mean(interval.map((row) => Number(Number(row.margin_low) <= Number(row.actual_margin) && Number(row.actual_margin) <= Number(row.margin_high)))),
    interval_mean_width: mean(interval.map((row) => Number(row.margin_high) - Number(row.margin_low))),
    expected_calibration_error: calibratedGames
      ? reliability.reduce((sum, bin) => sum + bin.games * Math.abs(Number(bin.observed) - Number(bin.predicted)), 0)
        / calibratedGames
      : null,
    reliability,
  };
}

function summary(rows: Json[], registeredVersions: number, marketObservations: number, unmatchedEvents: number, readiness: MarketComparisonReadiness): Json {
  const marketSummary = (statuses: Set<string>, includeSettlementMetrics: boolean) => {
    const groups = new Map<string, Json[]>();
    for (const row of rows) for (const quote of (row.comparisons as Json[])) {
      if (!statuses.has(String(row.status))) continue;
      const modelId = String(row.model_id || "");
      const key = `${modelId}|${quote.provider}|${marketBookmakerKey(quote.bookmaker)}|${quote.market}`;
      groups.set(key, [...(groups.get(key) || []), { ...quote, model_id: modelId }]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, quotes]) => {
    const first = quotes[0];
    const direction: Record<string, number> = {};
    for (const q of quotes) if (typeof q.direction_result === "string") direction[q.direction_result] = (direction[q.direction_result] || 0) + 1;
    const base = {
      model_id: first.model_id, provider: first.provider, bookmaker: first.bookmaker, market: first.market, games: quotes.length,
      model_difference_mean: mean(quotes.flatMap((q) => number(q.model_difference) === null ? [] : [Number(q.model_difference)])),
      market_overround_mean: mean(quotes.flatMap((q) => number(q.market_overround) === null ? [] : [Number(q.market_overround)])),
      direction_results: direction,
    };
    if (!includeSettlementMetrics) return base;
    return {
      ...base,
      model_mae: mean(quotes.flatMap((q) => number(q.model_absolute_error) === null ? [] : [Number(q.model_absolute_error)])),
      market_mae: mean(quotes.flatMap((q) => number(q.market_absolute_error) === null ? [] : [Number(q.market_absolute_error)])),
      model_brier: mean(quotes.flatMap((q) => number(q.model_brier) === null ? [] : [Number(q.model_brier)])),
      market_brier: mean(quotes.flatMap((q) => number(q.market_brier) === null ? [] : [Number(q.market_brier)])),
      model_winner_accuracy: mean(quotes.flatMap((q) => typeof q.model_winner_correct === "boolean" ? [q.model_winner_correct ? 1 : 0] : [])),
      market_winner_accuracy: mean(quotes.flatMap((q) => typeof q.market_winner_correct === "boolean" ? [q.market_winner_correct ? 1 : 0] : [])),
    };
  });
  };
  const marketMetrics = marketSummary(new Set(["settled"]), true);
  // Upcoming quotes are useful for matchup preparation, but cannot contribute
  // to model accuracy until a verified final is available. Keep this cohort
  // separate so a live line never appears to be a settled result.
  const pendingMarketMetrics = marketSummary(new Set(["scheduled", "awaiting_result"]), false);
  const counts: Record<string, number> = {};
  for (const row of rows) counts[String(row.status)] = (counts[String(row.status)] || 0) + 1;
  const modelGroups = new Map<string, Json[]>();
  for (const row of rows) {
    const modelId = String(row.model_id || "");
    const group = modelGroups.get(modelId);
    if (group) group.push(row);
    else modelGroups.set(modelId, [row]);
  }
  const modelMetrics = [...modelGroups.entries()].map(([modelId, selected]) => {
    const measured = metrics(selected);
    const registered = selected
      .map((row) => iso(row.registered_at))
      .filter((value): value is string => value !== null)
      .sort();
    return {
      model_id: modelId,
      selected_forecasts: selected.length,
      eligible_forecasts: selected.filter((row) => !row.exclusion).length,
      settled_games: measured.games,
      first_registered_at: registered[0] || null,
      last_registered_at: registered.at(-1) || null,
      margin_mae: measured.margin_mae,
      total_mae: measured.total_mae,
      winner_accuracy: measured.winner_accuracy,
      winner_picks: measured.winner_picks,
      brier: measured.brier,
      log_loss: measured.log_loss,
      interval_games: measured.interval_games,
      interval_coverage: measured.interval_coverage,
      interval_mean_width: measured.interval_mean_width,
      expected_calibration_error: measured.expected_calibration_error,
    };
  }).sort((left, right) =>
    String(right.last_registered_at || "").localeCompare(String(left.last_registered_at || ""))
      || left.model_id.localeCompare(right.model_id));
  const estimateGroups = new Map<string, { modelId: string; estimateType: EstimateType; rows: Json[] }>();
  for (const row of rows) {
    const modelId = String(row.model_id || "");
    const type = row.estimate_type === "primary" || row.estimate_type === "cold_start" || row.estimate_type === "unknown"
      ? row.estimate_type
      : estimateType(parse(row.payload_json) || {});
    const key = `${modelId}|${type}`;
    const group = estimateGroups.get(key);
    if (group) group.rows.push(row);
    else estimateGroups.set(key, { modelId, estimateType: type, rows: [row] });
  }
  const estimateMetrics = [...estimateGroups.values()].map(({ modelId, estimateType: type, rows: selected }) => {
    const measured = metrics(selected);
    const registered = selected
      .map((row) => iso(row.registered_at))
      .filter((value): value is string => value !== null)
      .sort();
    return {
      model_id: modelId,
      estimate_type: type,
      selected_forecasts: selected.length,
      eligible_forecasts: selected.filter((row) => !row.exclusion).length,
      settled_games: measured.games,
      first_registered_at: registered[0] || null,
      last_registered_at: registered.at(-1) || null,
      margin_mae: measured.margin_mae,
      total_mae: measured.total_mae,
      winner_accuracy: measured.winner_accuracy,
      winner_picks: measured.winner_picks,
      brier: measured.brier,
      log_loss: measured.log_loss,
      interval_games: measured.interval_games,
      interval_coverage: measured.interval_coverage,
      interval_mean_width: measured.interval_mean_width,
      expected_calibration_error: measured.expected_calibration_error,
    };
  }).sort((left, right) =>
    String(right.last_registered_at || "").localeCompare(String(left.last_registered_at || ""))
      || left.model_id.localeCompare(right.model_id)
      || left.estimate_type.localeCompare(right.estimate_type));
  const settledMarketObservations = rows
    .filter((row) => row.status === "settled")
    .reduce((total, row) => total + (row.comparisons as Json[]).length, 0);
  const pendingMarketObservations = rows
    .filter((row) => row.status === "scheduled" || row.status === "awaiting_result")
    .reduce((total, row) => total + (row.comparisons as Json[]).length, 0);
  return {
    games: rows.length,
    registered_versions: registeredVersions,
    market_observations: marketObservations,
    unmatched_events: unmatchedEvents,
    status_counts: counts,
    exclusion_counts: Object.fromEntries(rows.filter((row) => row.exclusion).reduce((map, row) => map.set(String(row.exclusion), (map.get(String(row.exclusion)) || 0) + 1), new Map<string, number>())),
    metrics: metrics(rows),
    games_with_comparisons: rows.filter((row) => (row.comparisons as Json[]).length).length,
    settled_market_observations: settledMarketObservations,
    pending_market_observations: pendingMarketObservations,
    qualifying_market_observations: rows.reduce(
      (total, row) => total + (row.comparisons as Json[]).length,
      0,
    ),
    comparison_readiness: {
      retained_observations: marketObservations,
      selected_game_observations: readiness.selected_game_observations,
      outside_selected_cohort: Math.max(0, marketObservations - readiness.selected_game_observations),
      eligible_observations: readiness.eligible_observations,
      comparable_observations: readiness.comparable_observations,
      superseded_observations: Math.max(0, readiness.comparable_observations - readiness.selected_comparisons),
      selected_comparisons: readiness.selected_comparisons,
      rejection_counts: readiness.rejection_counts,
    },
    model_metrics: modelMetrics,
    estimate_metrics: estimateMetrics,
    market_metrics: marketMetrics,
    pending_market_metrics: pendingMarketMetrics,
  };
}

async function latestSeason(db: D1Database, sport: Sport): Promise<number | null> {
  const row = await db.prepare("SELECT MAX(CAST(json_extract(payload_json,'$.season') AS INTEGER)) AS season FROM audit_predictions WHERE sport=?").bind(sport).first<{ season: number | null }>();
  return row?.season == null ? null : Number(row.season);
}

async function loadSport(db: D1Database, sport: Sport, season: number, now: string, modelId?: string): Promise<{ rows: Json[]; registeredVersions: number; comparisonReadiness: MarketComparisonReadiness }> {
  const modelClause = modelId ? " AND model_id=?" : "";
  const countBinds: Array<string | number> = [sport, season, now];
  if (modelId) countBinds.push(modelId);
  const count = await db.prepare(`SELECT count(*) AS total FROM audit_predictions WHERE sport=? AND CAST(json_extract(payload_json,'$.season') AS INTEGER)=? AND registered_at<=?${modelClause}`).bind(...countBinds).first<{ total: number }>();
  const predictionBinds: Array<string | number> = [now, sport, season, now];
  if (modelId) predictionBinds.push(modelId);
  const result = await db.prepare(`
    WITH latest_state AS (
      SELECT sport, game_id, payload_json,
             ROW_NUMBER() OVER (PARTITION BY sport,game_id ORDER BY observed_at DESC,id DESC) AS state_rank
       FROM audit_game_states WHERE observed_at<=?
    ), candidates AS (
      SELECT p.*, s.payload_json AS state_json,
        CASE
          WHEN s.payload_json IS NULL OR s.payload_json='null' THEN 'missing_schedule'
          WHEN json_extract(p.payload_json,'$.home_id') != json_extract(s.payload_json,'$.home_id')
            OR json_extract(p.payload_json,'$.away_id') != json_extract(s.payload_json,'$.away_id') THEN 'participants_changed'
          WHEN p.time_tbd=1 OR json_extract(s.payload_json,'$.time_tbd')=1 THEN 'unconfirmed_start'
          WHEN p.starts_at != json_extract(s.payload_json,'$.starts_at') THEN 'schedule_changed'
          WHEN p.registered_at >= p.starts_at THEN 'registered_after_start'
          WHEN p.generated_at > p.registered_at OR json_extract(p.payload_json,'$.model_cutoff') > p.generated_at THEN 'invalid_clock'
          ELSE NULL
        END AS exclusion
        FROM audit_predictions p
        LEFT JOIN latest_state s ON s.sport=p.sport AND s.game_id=p.game_id AND s.state_rank=1
       WHERE p.sport=? AND CAST(json_extract(p.payload_json,'$.season') AS INTEGER)=? AND p.registered_at<=?${modelId ? " AND p.model_id=?" : ""}
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY CASE WHEN exclusion IS NULL THEN 0 ELSE 1 END, CASE WHEN exclusion IS NULL THEN registered_at ELSE NULL END ASC, CASE WHEN exclusion IS NOT NULL THEN registered_at ELSE NULL END DESC, CASE WHEN exclusion IS NULL THEN generated_at ELSE NULL END ASC, CASE WHEN exclusion IS NOT NULL THEN generated_at ELSE NULL END DESC, id) AS pick
        FROM candidates
    )
    SELECT id,sport,game_id,model_id,generated_at,registered_at,starts_at,time_tbd,payload_json,state_json,exclusion
      FROM ranked WHERE pick=1 ORDER BY starts_at,sport,game_id
  `).bind(...predictionBinds).all();
  const rawRows = result.results as Array<Record<string, unknown>>;
  // Resolve source-confirmed clocks in a small, indexed read. Keeping this
  // outside the 98k-row prediction/window query avoids a D1 CPU blow-up while
  // preserving the exact source-date checks below.
  const clockResult = await db.prepare(`
    WITH latest_clock AS (
      SELECT sport,game_id,source_start,source_time_valid,observed_at,
             ROW_NUMBER() OVER (PARTITION BY sport,game_id ORDER BY observed_at DESC,id DESC) AS clock_rank
        FROM audit_schedule_times
       WHERE sport=? AND observed_at<=?
    )
    SELECT sport,game_id,source_start,source_time_valid,observed_at
      FROM latest_clock WHERE clock_rank=1
  `).bind(sport, now).all();
  const clockByGame = new Map<string, Record<string, unknown>>();
  for (const clock of clockResult.results as Array<Record<string, unknown>>) {
    clockByGame.set(String(clock.game_id), clock);
  }
  const quotesResult = await db.prepare("SELECT id,sport,game_id,provider,bookmaker,market,captured_at,updated_at,payload_json FROM audit_markets WHERE sport=? ORDER BY captured_at,updated_at,id").bind(sport).all();
  const quotesByGame = new Map<string, Json[]>();
  for (const quote of quotesResult.results as Array<Record<string, unknown>>) {
    const key = String(quote.game_id);
    quotesByGame.set(key, [...(quotesByGame.get(key) || []), quote]);
  }
  const rows: Json[] = [];
  const comparisonReadiness: MarketComparisonReadiness = {
    selected_game_observations: 0,
    eligible_observations: 0,
    comparable_observations: 0,
    selected_comparisons: 0,
    rejection_counts: {},
  };
  const reject = (reason: MarketRejection) => {
    comparisonReadiness.rejection_counts[reason] = (comparisonReadiness.rejection_counts[reason] || 0) + 1;
  };
  for (const row of rawRows) {
    const payload = parse(row.payload_json) || {};
    const state = parse(row.state_json);
    const prediction = object(payload.prediction) || {};
    const sourceClock = clockByGame.get(String(row.game_id));
    const sourceStart = sourceClock?.source_time_valid === 1 ? iso(sourceClock.source_start) : null;
    const canonicalStart = iso(row.starts_at);
    const stateStart = iso(state?.starts_at);
    const sourceClockResolved = Boolean(
      state && sourceStart && canonicalStart && stateStart
      && sourceStart.slice(0, 10) === canonicalStart.slice(0, 10)
      && sourceStart.slice(0, 10) === stateStart.slice(0, 10),
    );
    const effectiveStartsAt = sourceClockResolved && sourceStart ? sourceStart : row.starts_at;
    const effectiveState = sourceClockResolved && state && sourceStart
      ? { ...state, starts_at: sourceStart, time_tbd: 0 }
      : state;
    const effectiveRow = sourceClockResolved && sourceStart
      ? { ...row, starts_at: sourceStart, time_tbd: 0 }
      : row;
    let exclusion = typeof row.exclusion === "string" ? row.exclusion : null;
    // The SQL eligibility pass deliberately remains cheap and canonical. A
    // validated source clock can clear only the two schedule-time exclusions;
    // participant, registration, and model-clock failures remain excluded.
    if (sourceClockResolved && (exclusion === "unconfirmed_start" || exclusion === "schedule_changed")) exclusion = null;
    const status = exclusion ? "excluded" : finalStatus(effectiveState, now);
    const homeScore = number(effectiveState?.home_score);
    const awayScore = number(effectiveState?.away_score);
    const marginLow = number(prediction.margin_low);
    const marginHigh = number(prediction.margin_high);
    const validMarginInterval = marginLow !== null && marginHigh !== null && marginLow <= marginHigh;
    const item: Json = {
      id: row.id, sport, game_id: row.game_id, model_id: row.model_id, generated_at: row.generated_at, registered_at: row.registered_at, starts_at: effectiveStartsAt,
      canonical_starts_at: row.starts_at,
      source_starts_at: sourceStart,
      source_time_valid: sourceClockResolved ? true : sourceClock?.source_time_valid == null ? null : sourceClock.source_time_valid === 1,
      source_observed_at: iso(sourceClock?.observed_at),
      time_tbd: sourceClockResolved ? 0 : Number(row.time_tbd || 0), home_name: payload.home_name || "Unknown", away_name: payload.away_name || "Unknown", season: Number(payload.season || season),
      home_margin: number(prediction.home_margin), total: number(prediction.total), home_win_probability: probability(prediction.home_win_probability), margin_low: validMarginInterval ? marginLow : null, margin_high: validMarginInterval ? marginHigh : null,
      status, exclusion, actual_margin: status === "settled" && homeScore !== null && awayScore !== null ? homeScore - awayScore : null,
      actual_total: status === "settled" && homeScore !== null && awayScore !== null ? homeScore + awayScore : null,
      estimate_type: estimateType(payload),
      comparisons: [],
    };
    const gameQuotes = quotesByGame.get(String(row.game_id)) || [];
    comparisonReadiness.selected_game_observations += gameQuotes.length;
    if (!exclusion && effectiveState) {
      const chosen = new Map<string, Json>();
      for (const quote of gameQuotes) {
        const marketReason = marketExclusion(quote, { ...effectiveRow, payload_json: row.payload_json }, effectiveState, now);
        if (marketReason) {
          reject(marketReason);
          continue;
        }
        comparisonReadiness.eligible_observations += 1;
        const comparisonReason = comparisonExclusion({ ...effectiveRow, payload_json: row.payload_json }, quote);
        if (comparisonReason) {
          reject(comparisonReason);
          continue;
        }
        comparisonReadiness.comparable_observations += 1;
        chosen.set(`${quote.provider}|${marketBookmakerKey(quote.bookmaker)}|${quote.market}`, quote);
      }
      item.comparisons = [...chosen.values()].map((quote) => compare({ ...effectiveRow, payload_json: row.payload_json }, quote, effectiveState)).filter((quote): quote is Json => quote !== null);
      comparisonReadiness.selected_comparisons += (item.comparisons as Json[]).length;
    } else {
      for (const _quote of gameQuotes) reject("forecast_excluded");
    }
    rows.push(item);
  }
  return { rows, registeredVersions: Number(count?.total || 0), comparisonReadiness };
}

async function loadReport(db: D1Database, sport: Sport | "all", season: number | undefined, now: string, modelId?: string) {
  const sports = sport === "all" ? SPORTS : [sport];
  const seasons = await Promise.all(sports.map(async (code) => ({ code, season: season ?? await latestSeason(db, code) })));
  const loaded = await Promise.all(seasons.map(async ({ code, season: target }) => {
    const [data, marketCount, unmatchedCount] = await Promise.all([
      target === null ? Promise.resolve({
        rows: [],
        registeredVersions: 0,
        comparisonReadiness: { selected_game_observations: 0, eligible_observations: 0, comparable_observations: 0, selected_comparisons: 0, rejection_counts: {} },
      }) : loadSport(db, code, target, now, modelId),
      db.prepare("SELECT count(*) AS total FROM audit_markets WHERE sport=?").bind(code).first<{ total: number }>(),
      db.prepare("SELECT count(*) AS total FROM audit_unmatched WHERE sport=?").bind(code).first<{ total: number }>(),
    ]);
    return {
      code,
      season: target,
      data,
      marketObservations: Number(marketCount?.total || 0),
      unmatchedEvents: Number(unmatchedCount?.total || 0),
    };
  }));
  const games = loaded.flatMap((item) => item.data.rows);
  const summaries = Object.fromEntries(loaded.map(({ code, data, marketObservations, unmatchedEvents }) => [code, summary(data.rows, data.registeredVersions, marketObservations, unmatchedEvents, data.comparisonReadiness)]));
  return {
    loaded,
    games,
    summaries,
    market_observations: loaded.reduce((total, item) => total + item.marketObservations, 0),
    unmatched_events: loaded.reduce((total, item) => total + item.unmatchedEvents, 0),
  };
}

researchScorecard.get("/", zValidator("query", querySchema), async (c) => {
  const { sport, season, q, status, page, limit, model } = c.req.valid("query");
  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  if (cache) {
    try {
      const cached = await withTimeout(cache.match(cacheKey), 1000);
      if (cached) return cached;
    } catch {
      // Cache availability must never make the scorecard fail.
    }
  }
  const now = new Date().toISOString();
  let report: Awaited<ReturnType<typeof loadReport>>;
  try {
    report = await withTimeout(loadReport(researchDb(c.env), sport, season, now, model), DB_TIMEOUT_MS);
  } catch {
    return c.json({ error: "The live research scorecard is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
  const filtered = report.games.filter((row) => {
    if (status !== "all" && row.status !== status) return false;
    if (!q) return true;
    return `${row.home_name} ${row.away_name}`.toLowerCase().includes(q.toLowerCase());
  });
  const pageRows = filtered.slice(page * limit, page * limit + limit);
  const selectedSports = Object.fromEntries(report.loaded.map(({ code }) => [code, report.summaries[code]]));
  const response = c.json({
    live: true, generated_at: now, policy: POLICY, sport, season: season ?? null, model: model || null, status, query: q || null, page, page_size: limit, total: filtered.length,
    seasons: Object.fromEntries(report.loaded.map(({ code, season: target }) => [code, target])), sports: selectedSports, games: pageRows,
    market_observations: report.market_observations, unmatched_events: report.unmatched_events,
    qualifying_market_observations: report.loaded.reduce(
      (total, { data }) => total + data.rows.reduce(
        (sportTotal, row) => sportTotal + ((row.comparisons as Json[]) || []).length,
        0,
      ),
      0,
    ),
    selection: "First eligible registration per game. Latest captured pregame quote per provider, bookmaker and market after registration; not a verified closing line.", limitations: LIMITATION,
  });
  response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}, stale-while-revalidate=300`);
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
});
