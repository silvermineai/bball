"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BBFactorKey, BBGame, BBRosterScenario, BBTeam } from "../_lib/basketball-types";
import { fmt, kick, date } from "../_lib/format";
import {
  forecastModelId,
  loadLiveBasketballMarketEvidence,
  loadLiveBasketballForecasts,
  matchingRosterScenario,
  mergeLiveBasketballForecasts,
} from "../_lib/live-basketball-forecasts";
import {
  matchesMatchupSignal,
  forecastSignal,
  type MatchupSignal,
} from "../_lib/basketball-matchups";
import { hasQualifiedMarketComparison, marketTimingLabel, summarizeMarketLines } from "../_lib/market-display";
import { gameMarketReadinessLabel } from "../_lib/game-market-readiness";
import type { Comparison } from "../_lib/research-types";
import type { LedgerGame } from "../_lib/research-types";
import { downloadCsv, toCsv, type CsvCell } from "../_lib/csv";
import { forecastEvidenceCoverage, forecastEvidenceLabel } from "../_lib/forecast-lab-analysis";
import { basketballCalibrationContext, type BasketballCalibrationBucket, type BasketballCalibrationContext } from "../_lib/basketball-calibration";

const predictionFor = (game: BBGame) => game.prediction || game.fallback_prediction;
const latestTip = (game: BBGame) =>
  game.source_time_valid && game.source_start
    ? kick(game.source_start)
    : game.time_tbd
      ? "Time TBD"
      : kick(game.starts_at);

export function tipStatus(game: BBGame) {
  if (game.source_time_valid && game.source_start) return "Source-confirmed start";
  if (game.time_tbd) return "Time TBD";
  return "Scheduled time";
}

function modelLabel(game: BBGame) {
  return game.prediction ? "SILVERMINE MODEL" : "SILVERMINE COLD START";
}

export type ForecastBoardSort = "start" | "confidence" | "margin";
export type ForecastEstimateFilter = "all" | "primary" | "cold-start";
const signalLabels: Record<MatchupSignal, string> = {
  all: "all model signals",
  "toss-up": "toss-ups under 60%",
  lean: "leans from 60–74.9%",
  strong: "strong leans at 75%+",
};

const factorLabels: Record<BBFactorKey, string> = {
  efg: "eFG",
  tov: "TO",
  orb: "ORB",
  ftr: "FTR",
};

/** Keep the compact board explainable without turning each row into a card. */
export function strongestFactorEdge(game: BBGame) {
  if (game.matchup_factors_same_edition === false) return null;
  const strongest = matchupFactorEdges(game)
    .map((edge) => [edge.key, edge.value] as [BBFactorKey, number])
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))[0];
  if (!strongest || strongest[1] === 0) return null;
  const [key, edge] = strongest;
  return `${edge > 0 ? "H" : "A"} ${factorLabels[key]} ${fmt(Math.abs(edge) * 100, 1)}`;
}

export function matchupFactorEdges(game: BBGame) {
  const edges = game.matchup_factors?.edges;
  if (!edges) return [] as Array<{ key: BBFactorKey; value: number }>;
  return (Object.keys(factorLabels) as BBFactorKey[])
    .map((key) => ({ key, value: edges[key] }))
    .filter((edge): edge is { key: BBFactorKey; value: number } => edge.value != null && Number.isFinite(edge.value));
}

/** Keep the context vintage visible beside every factor edge. */
export function matchupFactorContextLabel(game: BBGame) {
  const season = game.matchup_factors?.season;
  if (!Number.isInteger(season)) return "Four Factor context unavailable";
  if (game.matchup_factors_same_edition === false) {
    return `Other-edition context · ${game.matchup_factors_model_id || "edition unavailable"} · ${season}`;
  }
  return `Four Factor context · ${season}`;
}

/**
 * Summarize the evidence attached to one board row using the same gates as
 * the expanded game card. Keeping this calculation shared prevents the slate
 * table from implying that an estimate is ready for prep when a required
 * join, source-confirmed clock, or same-edition context is missing.
 */
export function forecastBoardEvidence(
  game: BBGame,
  rosterScenario: BBRosterScenario | null | undefined,
  market: boolean,
) {
  return forecastEvidenceCoverage({
    primary: !!game.prediction,
    scheduled: !!(game.source_time_valid && game.source_start),
    factors: !!game.matchup_factors && game.matchup_factors_same_edition !== false,
    roster: !!rosterScenario,
    market,
  });
}

/**
 * Attach held-out probability-band evidence only to a primary forecast from
 * the exact edition that produced the calibration replay. A live refresh can
 * move ahead of the bundled dashboard, so an edition mismatch stays blank.
 */
export function dashboardForecastCalibration(
  game: BBGame,
  buckets: readonly BasketballCalibrationBucket[],
  calibrationModelId: string | null | undefined,
  publishedModelId: string,
): BasketballCalibrationContext | null {
  if (!game.prediction || !calibrationModelId) return null;
  const forecastModelId = game.forecast_model_id || publishedModelId;
  if (forecastModelId !== calibrationModelId) return null;
  return basketballCalibrationContext(game.prediction.home_win_probability, buckets);
}

export const forecastCsvHeaders = [
  "Game ID", "Tip", "Away", "Home", "Estimate type", "Away score", "Home score", "Home win probability",
  "Projected margin", "Margin low", "Margin high", "Projected total", "Pace", "Away efficiency", "Home efficiency", "eFG edge", "TO edge", "ORB edge",
  "FTR edge", "Forecast model edition", "Forecast generated", "Forecast target season", "Four Factor model edition", "Four Factor same edition", "Four Factor generated", "Roster margin", "Market spread", "Market total", "Spread gap", "Total gap",
  "Home adj offense", "Home adj defense", "Home adj net", "Home pace", "Away adj offense", "Away adj defense", "Away adj net", "Away pace", "Verified market home probability", "Moneyline probability gap", "Market captured at",
];

export function forecastCsvRows(
  games: BBGame[],
  marketComparisons: Record<string, Comparison[]> = {},
  rosterScenarios: BBRosterScenario[] = [],
  ratings: BBTeam[] = [],
  publishedModelId = "",
): CsvCell[][] {
  const rosterByGame = new Map(rosterScenarios.map((scenario) => [scenario.game_id, scenario]));
  const ratingById = new Map(ratings.map((rating) => [rating.id, rating]));
  return games.map((game) => {
    const prediction = predictionFor(game);
    const market = summarizeMarketLines(marketComparisons[game.id] || []);
    const factorValues = new Map(matchupFactorEdges(game).map((edge) => [edge.key, edge.value]));
    const home = ratingById.get(game.home_id);
    const away = ratingById.get(game.away_id);
    return [
      game.id, game.starts_at, game.away_name, game.home_name, game.prediction ? "primary" : "cold-start",
      prediction?.away_score, prediction?.home_score, prediction?.home_win_probability,
      prediction?.home_margin, prediction?.margin_low, prediction?.margin_high, prediction?.total, prediction?.pace, prediction?.away_efficiency, prediction?.home_efficiency,
      factorValues.get("efg"), factorValues.get("tov"), factorValues.get("orb"), factorValues.get("ftr"),
      game.forecast_model_id ?? (publishedModelId || null), game.forecast_created_at ?? null, game.season,
      game.matchup_factors_model_id ?? null,
      game.matchup_factors_same_edition == null ? null : game.matchup_factors_same_edition ? "yes" : "no",
      game.matchup_factors_generated_at ?? null,
      matchingRosterScenario(game, rosterByGame.get(game.id), publishedModelId)?.roster_margin ?? null, market.spread, market.total, market.spreadGap, market.totalGap,
      home?.adj_off, home?.adj_def, home?.adj_net, home?.adj_tempo,
      away?.adj_off, away?.adj_def, away?.adj_net, away?.adj_tempo,
      market.homeProbability == null ? null : market.homeProbability * 100,
      market.winProbabilityGap == null ? null : market.winProbabilityGap * 100,
      market.capturedAt,
    ];
  });
}

const startValue = (game: BBGame) => {
  const value = Date.parse(game.starts_at);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
};

/** Return a stable, user-facing ordering for the compact homepage board. */
export function sortForecastBoard(games: BBGame[], sort: ForecastBoardSort) {
  return [...games].sort((left, right) => {
    const leftPrediction = predictionFor(left);
    const rightPrediction = predictionFor(right);
    if (!leftPrediction || !rightPrediction) return leftPrediction ? -1 : rightPrediction ? 1 : left.id.localeCompare(right.id);

    if (sort === "confidence") {
      const leftConfidence = Math.max(leftPrediction.home_win_probability, 1 - leftPrediction.home_win_probability);
      const rightConfidence = Math.max(rightPrediction.home_win_probability, 1 - rightPrediction.home_win_probability);
      if (rightConfidence !== leftConfidence) return rightConfidence - leftConfidence;
    } else if (sort === "margin") {
      const leftMargin = Math.abs(leftPrediction.home_margin);
      const rightMargin = Math.abs(rightPrediction.home_margin);
      if (rightMargin !== leftMargin) return rightMargin - leftMargin;
    }

    return startValue(left) - startValue(right) || left.id.localeCompare(right.id);
  });
}

export function matchesEstimateFilter(game: BBGame, filter: ForecastEstimateFilter) {
  if (filter === "all") return Boolean(predictionFor(game));
  return filter === "primary" ? Boolean(game.prediction) : Boolean(game.fallback_prediction && !game.prediction);
}

export default function LiveDashboardForecastTable({
  initialGames,
  rosterScenarios = [],
  ratings = [],
  publishedModelId,
  calibrationBuckets = [],
  calibrationModelId = null,
}: {
  initialGames: BBGame[];
  rosterScenarios?: BBRosterScenario[];
  ratings?: BBTeam[];
  publishedModelId: string;
  calibrationBuckets?: readonly BasketballCalibrationBucket[];
  calibrationModelId?: string | null;
}) {
  const [games, setGames] = useState(initialGames);
  const [sort, setSort] = useState<ForecastBoardSort>("start");
  const [signal, setSignal] = useState<MatchupSignal>("all");
  const [estimate, setEstimate] = useState<ForecastEstimateFilter>("all");
  const [query, setQuery] = useState("");
  const [rowLimit, setRowLimit] = useState<12 | 24 | 48>(12);
  const [marketComparisons, setMarketComparisons] = useState<Record<string, Comparison[]>>({});
  const [marketReadiness, setMarketReadiness] = useState<Record<string, NonNullable<LedgerGame["market_readiness"]>>>({});

  useEffect(() => {
    const controller = new AbortController();
    // Clear the prior edition before resolving the next one. A refresh must
    // never leave an older quote visible beside a newer model forecast.
    setMarketComparisons({});
    setMarketReadiness({});
    // Hydrate the forecast cohort first. Market evidence is requested only
    // after one model edition is known, so a game can never display a line
    // selected from a different ledger edition.
    loadLiveBasketballForecasts(controller.signal)
      .then(async (rows) => {
        if (controller.signal.aborted) return;
        setGames(mergeLiveBasketballForecasts(initialGames, rows));
        try {
          const evidence = await loadLiveBasketballMarketEvidence(controller.signal, forecastModelId(rows));
          if (!controller.signal.aborted) {
            setMarketComparisons(evidence.comparisons);
            setMarketReadiness(evidence.readiness);
          }
        } catch {
          // Market evidence is optional; the forecast board remains useful.
        }
      })
      .catch(() => {
        // Keep the server-rendered board when the live forecast is unavailable.
        setMarketComparisons({});
        setMarketReadiness({});
      });
    return () => controller.abort();
  }, [initialGames]);

  const forecastedGames = games
    .filter((game) => matchesEstimateFilter(game, estimate))
    .filter((game) => `${game.away_name} ${game.home_name}`.toLowerCase().includes(query.trim().toLowerCase()));
  const signalGames = forecastedGames.filter((game) => matchesMatchupSignal(predictionFor(game), signal));
  const rows = sortForecastBoard(signalGames, sort).slice(0, rowLimit);
  const rosterByGame = new Map(rosterScenarios.map((scenario) => [scenario.game_id, scenario]));
  const ratingById = new Map(ratings.map((rating) => [rating.id, rating]));
  const marketGames = signalGames.filter((game) => {
    const market = summarizeMarketLines(marketComparisons[game.id] || []);
    return hasQualifiedMarketComparison(market);
  }).length;
  const orderedSignalGames = sortForecastBoard(signalGames, sort);
  const downloadVisibleCsv = () => downloadCsv(
    "basketball-forecast-board.csv",
    toCsv(forecastCsvHeaders, forecastCsvRows(rows, marketComparisons, rosterScenarios, ratings, publishedModelId)),
  );
  const downloadAllCsv = () => downloadCsv(
    "basketball-forecast-board-filtered.csv",
    toCsv(forecastCsvHeaders, forecastCsvRows(orderedSignalGames, marketComparisons, rosterScenarios, ratings, publishedModelId)),
  );
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label className="control">
          <span>SEARCH TEAM</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Program name" aria-label="Search forecast teams" />
        </label>
        <label className="control">
          <span>ORDER SLATE BY</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as ForecastBoardSort)}>
            <option value="start">Tip time</option>
            <option value="confidence">Model confidence</option>
            <option value="margin">Projected margin</option>
          </select>
        </label>
        <label className="control">
          <span>MODEL SIGNAL</span>
          <select value={signal} onChange={(event) => setSignal(event.target.value as MatchupSignal)}>
            <option value="all">All forecast signals</option>
            <option value="toss-up">Toss-ups · under 60%</option>
            <option value="lean">Leans · 60–74.9%</option>
            <option value="strong">Strong leans · 75%+</option>
          </select>
        </label>
        <label className="control">
          <span>ESTIMATE TYPE</span>
          <select value={estimate} onChange={(event) => setEstimate(event.target.value as ForecastEstimateFilter)}>
            <option value="all">All estimates</option>
            <option value="primary">Primary model only</option>
            <option value="cold-start">Cold-start only</option>
          </select>
        </label>
        <label className="control">
          <span>SHOW</span>
          <select value={rowLimit} onChange={(event) => setRowLimit(Number(event.target.value) as 12 | 24 | 48)}>
            <option value={12}>12 games</option>
            <option value={24}>24 games</option>
            <option value={48}>48 games</option>
          </select>
        </label>
        <button className="button secondary" type="button" onClick={downloadVisibleCsv} disabled={!rows.length}>Download visible CSV ↓</button>
        <button className="button secondary" type="button" onClick={downloadAllCsv} disabled={!signalGames.length}>Download full filtered CSV ↓</button>
        <p className="note" role="status">
          Showing {rows.length} of {signalGames.length} forecast rows{query.trim() ? ` matching “${query.trim()}”` : ""} · {signalLabels[signal]} · {sort === "start" ? "earliest tips first" : sort === "confidence" ? "most certain outcomes first" : "largest projected edges first"} · {marketGames} with qualifying market lines.
        </p>
      </div>
      <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table forecast-table">
        <thead>
          <tr><th>Game</th><th>Tip</th><th>Model</th><th>Analysis packet</th><th className="numeric">Projected</th><th className="numeric">Home win</th><th className="numeric">Held-out band</th><th className="numeric">Margin</th><th className="numeric">Tempo</th><th className="numeric">Efficiency</th><th className="numeric">Factor edge</th><th className="numeric">Team ratings</th><th className="numeric">Roster lens</th><th className="numeric">Market</th><th className="numeric">Model − line</th><th className="numeric">Range</th><th className="numeric">Total</th></tr>
        </thead>
        <tbody>
          {rows.map((game) => {
            const prediction = predictionFor(game)!;
            const rosterScenario = matchingRosterScenario(game, rosterByGame.get(game.id), publishedModelId);
            const homeRating = ratingById.get(game.home_id);
            const awayRating = ratingById.get(game.away_id);
            const market = summarizeMarketLines(marketComparisons[game.id] || []);
            const readiness = marketReadiness[game.id];
            const marketTiming = marketTimingLabel(marketComparisons[game.id] || [], game.starts_at);
            const factorEdges = matchupFactorEdges(game);
            const evidence = forecastBoardEvidence(game, rosterScenario, hasQualifiedMarketComparison(market));
            const calibration = dashboardForecastCalibration(game, calibrationBuckets, calibrationModelId, publishedModelId);
            return (
              <tr key={game.id}>
                <th scope="row"><Link href={`/basketball/matchups/?game=${encodeURIComponent(game.id)}`}><strong>{game.away_name}</strong><small>at {game.home_name}</small></Link><small><Link href={`/blog/basketball-game-${encodeURIComponent(game.id)}/`}>Read game notebook →</Link></small></th>
                <td>{date(game.starts_at)}<small>{latestTip(game)}</small><small>{tipStatus(game)}</small></td>
                <td><span className={`model-tag ${game.prediction ? "primary" : "baseline"}`}>{modelLabel(game)}</span><small>{forecastSignal(prediction).label}</small><small>{game.forecast_model_id ? `Edition ${game.forecast_model_id}` : "Edition unavailable"}</small><small>{game.forecast_created_at && Number.isFinite(Date.parse(game.forecast_created_at)) ? `Generated ${kick(game.forecast_created_at)}` : "Forecast clock unavailable"}</small></td>
                <td aria-label={`Analysis packet: ${forecastEvidenceLabel(evidence)}`}><strong>{evidence.present}/{evidence.total} core</strong><small>{evidence.market === "verified" ? "Verified market attached" : "Market pending"}</small>{evidence.missing.length > 0 && <small title={evidence.missing.join(", ")}>Missing: {evidence.missing.slice(0, 2).join(", ")}{evidence.missing.length > 2 ? "…" : ""}</small>}</td>
                <td className="numeric"><strong>{fmt(prediction.away_score)}–{fmt(prediction.home_score)}</strong><small>{prediction.home_win_probability >= 0.5 ? game.home_name : game.away_name} projected winner</small></td>
                <td className="numeric"><strong>{fmt(prediction.home_win_probability * 100)}%</strong></td>
                <td className="numeric">{calibration ? <><strong>{calibration.side} {fmt(calibration.confidence_lower * 100, 0)}–{fmt(calibration.confidence_upper * 100, 0)}%</strong><small>{calibration.games.toLocaleString()} held-out · {calibration.observed == null ? "observed rate unavailable" : `${fmt(calibration.observed * 100, 1)}% observed`}</small>{calibration.observed_gap_pp == null ? null : <small>{calibration.observed_gap_pp >= 0 ? "+" : ""}{fmt(calibration.observed_gap_pp, 1)} pp observed vs model</small>}</> : <span className="note">Unavailable</span>}</td>
                <td className="numeric">{prediction.home_margin >= 0 ? "+" : ""}{fmt(prediction.home_margin)}</td>
                <td className="numeric"><strong>{fmt(prediction.pace)}</strong><small>possessions</small></td>
                <td className="numeric">{prediction.away_efficiency == null && prediction.home_efficiency == null ? "—" : <><span>{fmt(prediction.away_efficiency, 1)} / {fmt(prediction.home_efficiency, 1)}</span><small>A / H pts per 100</small></>}</td>
                <td className="numeric">
                  {strongestFactorEdge(game) || "—"}<small>{matchupFactorContextLabel(game)}</small>
                  {factorEdges.length > 0 && <details className="forecast-factor-details"><summary>All four</summary>{factorEdges.map((edge) => <small key={edge.key}>{factorLabels[edge.key]} {edge.value >= 0 ? "H" : "A"} {fmt(Math.abs(edge.value) * 100, 1)}</small>)}</details>}
                </td>
                <td className="numeric">{homeRating || awayRating ? <details className="forecast-factor-details"><summary>Show ratings</summary>{homeRating ? <small>H {fmt(homeRating.adj_off)} off · {fmt(homeRating.adj_def)} def · {fmt(homeRating.adj_net)} net</small> : <small>H unavailable</small>}{awayRating ? <small>A {fmt(awayRating.adj_off)} off · {fmt(awayRating.adj_def)} def · {fmt(awayRating.adj_net)} net</small> : <small>A unavailable</small>}</details> : "—"}</td>
                <td className="numeric">{rosterScenario ? <><strong>{rosterScenario.roster_margin >= 0 ? "+" : ""}{fmt(rosterScenario.roster_margin)}</strong><small>{rosterScenario.margin_delta >= 0 ? "+" : ""}{fmt(rosterScenario.margin_delta)} vs base</small></> : "—"}</td>
                <td className="numeric">{!hasQualifiedMarketComparison(market) ? readiness ? <><strong className="note">{gameMarketReadinessLabel(readiness)}</strong><small title={readiness.message}>{readiness.message}</small></> : "—" : <>{market.spread == null ? null : <span>H {market.spread >= 0 ? "+" : ""}{fmt(market.spread)}</span>}{market.total == null ? null : <small>O/U {fmt(market.total)}</small>}{market.homeProbability == null ? null : <small>ML {fmt(market.homeProbability * 100, 1)}% home</small>}{market.capturedAt && <small>Quote {date(market.capturedAt)}</small>}{marketTiming && <small>{marketTiming}</small>}</>}</td>
                <td className="numeric">{market.spreadGap == null && market.totalGap == null && market.winProbabilityGap == null ? "—" : <>{market.spreadGap == null ? null : <span>{market.spreadGap >= 0 ? "+" : ""}{fmt(market.spreadGap)} spread</span>}{market.totalGap == null ? null : <small>{market.totalGap >= 0 ? "+" : ""}{fmt(market.totalGap)} total</small>}{market.winProbabilityGap == null ? null : <small>{market.winProbabilityGap >= 0 ? "+" : ""}{fmt(market.winProbabilityGap * 100, 1)} pp ML</small>}</>}</td>
                <td className="numeric">{prediction.margin_low >= 0 ? "+" : ""}{fmt(prediction.margin_low)} to {prediction.margin_high >= 0 ? "+" : ""}{fmt(prediction.margin_high)}<small>calibrated margin band</small></td>
                <td className="numeric">{fmt(prediction.total)}{prediction.total_low == null || prediction.total_high == null ? <small>Total range unavailable for this edition</small> : <small>{fmt(prediction.total_low)} to {fmt(prediction.total_high)} · calibrated total range</small>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
