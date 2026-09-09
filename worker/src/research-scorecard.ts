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
});

export const researchScorecard = new Hono<{ Bindings: Bindings }>();

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

function number(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
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

function marketEligible(quote: Json, prediction: Json, state: Json, now: string): boolean {
  const q = parse(quote.payload_json) || {};
  const starts = String(prediction.starts_at);
  const stateStarts = String(state.starts_at ?? "");
  const boundary = starts < stateStarts ? starts : stateStarts;
  const captured = String(quote.captured_at);
  const updated = String(quote.updated_at);
  const capturedTime = Date.parse(captured);
  const updatedTime = Date.parse(updated);
  const nowTime = Date.parse(now);
  const age = capturedTime - updatedTime;
  return String(q.home_id ?? "") === String(state.home_id ?? "")
    && String(q.away_id ?? "") === String(state.away_id ?? "")
    && String(q.starts_at ?? "") === boundary
    && String(prediction.registered_at) <= captured
    && captured < boundary
    && updated <= captured
    && captured <= now
    && updated < boundary
    && Number.isFinite(age) && age <= 86400000
    && Number.isFinite(nowTime);
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
  const modelWin = number(p.home_win_probability);
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
    }
  }
  return output;
}

function metrics(rows: Json[]): Json {
  const settled = rows.filter((row) => row.status === "settled");
  const binary = settled.filter((row) => number(row.actual_margin) !== 0);
  const marginErrors = settled.flatMap((row) => number(row.home_margin) !== null && number(row.actual_margin) !== null ? [Math.abs(Number(row.home_margin) - Number(row.actual_margin))] : []);
  const totalErrors = settled.flatMap((row) => number(row.total) !== null && number(row.actual_total) !== null ? [Math.abs(Number(row.total) - Number(row.actual_total))] : []);
  const picks = binary.filter((row) => number(row.home_win_probability) !== null && number(row.home_win_probability) !== 0.5);
  const winner = picks.map((row) => (Number(row.home_win_probability) > 0.5) === (Number(row.actual_margin) > 0) ? 1 : 0);
  const brier = binary.flatMap((row) => number(row.home_win_probability) !== null && number(row.actual_margin) !== null ? [(Number(row.home_win_probability) - (Number(row.actual_margin) > 0 ? 1 : 0)) ** 2] : []);
  const logLoss = binary.flatMap((row) => {
    const p = number(row.home_win_probability);
    const margin = number(row.actual_margin);
    if (p === null || margin === null) return [];
    const likelihood = margin > 0 ? p : 1 - p;
    return [-Math.log(Math.max(1e-12, Math.min(1 - 1e-12, likelihood)))];
  });
  const interval = settled.filter((row) => number(row.margin_low) !== null && number(row.margin_high) !== null && number(row.actual_margin) !== null);
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
  };
}

function summary(rows: Json[], registeredVersions: number): Json {
  const groups = new Map<string, Json[]>();
  for (const row of rows) for (const quote of (row.comparisons as Json[])) {
    if (row.status !== "settled") continue;
    const key = `${quote.provider}|${quote.bookmaker}|${quote.market}`;
    groups.set(key, [...(groups.get(key) || []), quote]);
  }
  const marketMetrics = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, quotes]) => {
    const first = quotes[0];
    const direction: Record<string, number> = {};
    for (const q of quotes) if (typeof q.direction_result === "string") direction[q.direction_result] = (direction[q.direction_result] || 0) + 1;
    return {
      provider: first.provider, bookmaker: first.bookmaker, market: first.market, games: quotes.length,
      model_mae: mean(quotes.flatMap((q) => number(q.model_absolute_error) === null ? [] : [Number(q.model_absolute_error)])),
      market_mae: mean(quotes.flatMap((q) => number(q.market_absolute_error) === null ? [] : [Number(q.market_absolute_error)])),
      model_brier: mean(quotes.flatMap((q) => number(q.model_brier) === null ? [] : [Number(q.model_brier)])),
      market_brier: mean(quotes.flatMap((q) => number(q.market_brier) === null ? [] : [Number(q.market_brier)])),
      direction_results: direction,
    };
  });
  const counts: Record<string, number> = {};
  for (const row of rows) counts[String(row.status)] = (counts[String(row.status)] || 0) + 1;
  return {
    games: rows.length,
    registered_versions: registeredVersions,
    status_counts: counts,
    exclusion_counts: Object.fromEntries(rows.filter((row) => row.exclusion).reduce((map, row) => map.set(String(row.exclusion), (map.get(String(row.exclusion)) || 0) + 1), new Map<string, number>())),
    metrics: metrics(rows),
    games_with_comparisons: rows.filter((row) => (row.comparisons as Json[]).length).length,
    market_metrics: marketMetrics,
  };
}

async function latestSeason(db: D1Database, sport: Sport): Promise<number | null> {
  const row = await db.prepare("SELECT MAX(CAST(json_extract(payload_json,'$.season') AS INTEGER)) AS season FROM audit_predictions WHERE sport=?").bind(sport).first<{ season: number | null }>();
  return row?.season == null ? null : Number(row.season);
}

async function loadSport(db: D1Database, sport: Sport, season: number, now: string): Promise<{ rows: Json[]; registeredVersions: number }> {
  const count = await db.prepare("SELECT count(*) AS total FROM audit_predictions WHERE sport=? AND CAST(json_extract(payload_json,'$.season') AS INTEGER)=? AND registered_at<=?").bind(sport, season, now).first<{ total: number }>();
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
       WHERE p.sport=? AND CAST(json_extract(p.payload_json,'$.season') AS INTEGER)=? AND p.registered_at<=?
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY CASE WHEN exclusion IS NULL THEN 0 ELSE 1 END, registered_at, generated_at, id) AS pick
        FROM candidates
    )
    SELECT id,sport,game_id,model_id,generated_at,registered_at,starts_at,time_tbd,payload_json,state_json,exclusion
      FROM ranked WHERE pick=1 ORDER BY starts_at,sport,game_id
  `).bind(now, sport, season, now).all();
  const rawRows = result.results as Array<Record<string, unknown>>;
  const quotesResult = await db.prepare("SELECT id,sport,game_id,provider,bookmaker,market,captured_at,updated_at,payload_json FROM audit_markets WHERE sport=? ORDER BY captured_at,updated_at,id").bind(sport).all();
  const quotesByGame = new Map<string, Json[]>();
  for (const quote of quotesResult.results as Array<Record<string, unknown>>) {
    const key = String(quote.game_id);
    quotesByGame.set(key, [...(quotesByGame.get(key) || []), quote]);
  }
  const rows: Json[] = [];
  for (const row of rawRows) {
    const payload = parse(row.payload_json) || {};
    const state = parse(row.state_json);
    const prediction = object(payload.prediction) || {};
    const exclusion = typeof row.exclusion === "string" ? row.exclusion : null;
    const status = exclusion ? "excluded" : finalStatus(state, now);
    const homeScore = number(state?.home_score);
    const awayScore = number(state?.away_score);
    const item: Json = {
      id: row.id, sport, game_id: row.game_id, model_id: row.model_id, generated_at: row.generated_at, registered_at: row.registered_at, starts_at: row.starts_at,
      time_tbd: Number(row.time_tbd || 0), home_name: payload.home_name || "Unknown", away_name: payload.away_name || "Unknown", season: Number(payload.season || season),
      home_margin: number(prediction.home_margin), total: number(prediction.total), home_win_probability: number(prediction.home_win_probability), margin_low: number(prediction.margin_low), margin_high: number(prediction.margin_high),
      status, exclusion, actual_margin: status === "settled" && homeScore !== null && awayScore !== null ? homeScore - awayScore : null,
      actual_total: status === "settled" && homeScore !== null && awayScore !== null ? homeScore + awayScore : null, comparisons: [],
    };
    if (!exclusion && state) {
      const chosen = new Map<string, Json>();
      for (const quote of quotesByGame.get(String(row.game_id)) || []) {
        if (marketEligible(quote, { ...row, payload_json: row.payload_json }, state, now)) chosen.set(`${quote.provider}|${quote.bookmaker}|${quote.market}`, quote);
      }
      item.comparisons = [...chosen.values()].map((quote) => compare({ ...row, payload_json: row.payload_json }, quote, state)).filter((quote): quote is Json => quote !== null);
    }
    rows.push(item);
  }
  return { rows, registeredVersions: Number(count?.total || 0) };
}

async function loadReport(db: D1Database, sport: Sport | "all", season: number | undefined, now: string) {
  const sports = sport === "all" ? SPORTS : [sport];
  const seasons = await Promise.all(sports.map(async (code) => ({ code, season: season ?? await latestSeason(db, code) })));
  const loaded = await Promise.all(seasons.map(async ({ code, season: target }) => ({ code, season: target, data: target === null ? { rows: [], registeredVersions: 0 } : await loadSport(db, code, target, now) })));
  const games = loaded.flatMap((item) => item.data.rows);
  const summaries = Object.fromEntries(loaded.map(({ code, data }) => [code, summary(data.rows, data.registeredVersions)]));
  const marketCount = await db.prepare("SELECT count(*) AS total FROM audit_markets").first<{ total: number }>();
  const unmatchedCount = await db.prepare("SELECT count(*) AS total FROM audit_unmatched").first<{ total: number }>();
  return { loaded, games, summaries, market_observations: Number(marketCount?.total || 0), unmatched_events: Number(unmatchedCount?.total || 0) };
}

researchScorecard.get("/", zValidator("query", querySchema), async (c) => {
  const { sport, season, q, status, page, limit } = c.req.valid("query");
  const now = new Date().toISOString();
  const report = await loadReport(researchDb(c.env), sport, season, now);
  const filtered = report.games.filter((row) => {
    if (status !== "all" && row.status !== status) return false;
    if (!q) return true;
    return `${row.home_name} ${row.away_name}`.toLowerCase().includes(q.toLowerCase());
  });
  const pageRows = filtered.slice(page * limit, page * limit + limit);
  const selectedSports = Object.fromEntries(report.loaded.map(({ code }) => [code, report.summaries[code]]));
  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return c.json({
    live: true, generated_at: now, policy: POLICY, sport, season: season ?? null, status, query: q || null, page, page_size: limit, total: filtered.length,
    seasons: Object.fromEntries(report.loaded.map(({ code, season: target }) => [code, target])), sports: selectedSports, games: pageRows,
    market_observations: report.market_observations, unmatched_events: report.unmatched_events,
    selection: "First eligible registration per game. Latest captured pregame quote per provider, bookmaker and market after registration; not a verified closing line.", limitations: LIMITATION,
  });
});
