"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BBFactorKey, BBGame, BBRosterScenario, BBTeam } from "../_lib/basketball-types";
import { fmt, kick, date } from "../_lib/format";
import {
  loadLiveBasketballForecasts,
  mergeLiveBasketballForecasts,
} from "../_lib/live-basketball-forecasts";
import {
  matchesMatchupSignal,
  forecastSignal,
  type MatchupSignal,
} from "../_lib/basketball-matchups";
import { summarizeMarketLines } from "../_lib/market-display";
import { loadLiveBasketballMarketComparisons } from "../_lib/live-basketball-forecasts";
import type { Comparison } from "../_lib/research-types";
import { downloadCsv, toCsv, type CsvCell } from "../_lib/csv";

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

export const forecastCsvHeaders = [
  "Game ID", "Tip", "Away", "Home", "Estimate type", "Away score", "Home score", "Home win probability",
  "Projected margin", "Margin low", "Margin high", "Projected total", "Pace", "eFG edge", "TO edge", "ORB edge",
  "FTR edge", "Roster margin", "Market spread", "Market total", "Spread gap", "Total gap",
  "Home adj offense", "Home adj defense", "Home adj net", "Home pace", "Away adj offense", "Away adj defense", "Away adj net", "Away pace",
];

export function forecastCsvRows(
  games: BBGame[],
  marketComparisons: Record<string, Comparison[]> = {},
  rosterScenarios: BBRosterScenario[] = [],
  ratings: BBTeam[] = [],
): CsvCell[][] {
  const rosterByGame = new Map(rosterScenarios.map((scenario) => [scenario.game_id, scenario]));
  const ratingById = new Map(ratings.map((rating) => [rating.id, rating]));
  return games.map((game) => {
    const prediction = predictionFor(game);
    const market = summarizeMarketLines(marketComparisons[game.id] || game.market_comparisons || []);
    const factorValues = new Map(matchupFactorEdges(game).map((edge) => [edge.key, edge.value]));
    const home = ratingById.get(game.home_id);
    const away = ratingById.get(game.away_id);
    return [
      game.id, game.starts_at, game.away_name, game.home_name, game.prediction ? "primary" : "cold-start",
      prediction?.away_score, prediction?.home_score, prediction?.home_win_probability,
      prediction?.home_margin, prediction?.margin_low, prediction?.margin_high, prediction?.total, prediction?.pace,
      factorValues.get("efg"), factorValues.get("tov"), factorValues.get("orb"), factorValues.get("ftr"),
      rosterByGame.get(game.id)?.roster_margin, market.spread, market.total, market.spreadGap, market.totalGap,
      home?.adj_off, home?.adj_def, home?.adj_net, home?.adj_tempo,
      away?.adj_off, away?.adj_def, away?.adj_net, away?.adj_tempo,
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
}: {
  initialGames: BBGame[];
  rosterScenarios?: BBRosterScenario[];
  ratings?: BBTeam[];
}) {
  const [games, setGames] = useState(initialGames);
  const [sort, setSort] = useState<ForecastBoardSort>("start");
  const [signal, setSignal] = useState<MatchupSignal>("all");
  const [estimate, setEstimate] = useState<ForecastEstimateFilter>("all");
  const [query, setQuery] = useState("");
  const [rowLimit, setRowLimit] = useState<12 | 24 | 48>(12);
  const [marketComparisons, setMarketComparisons] = useState<Record<string, Comparison[]>>({});

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      // The landing board is the primary forecast surface. Hydrate every
      // registered page so a live model refresh cannot leave later rows on
      // the bundled static edition while the forecast lab shows newer data.
      loadLiveBasketballForecasts(controller.signal),
      loadLiveBasketballMarketComparisons(controller.signal),
    ]).then(([forecastResult, marketResult]) => {
      if (controller.signal.aborted) return;
      if (forecastResult.status === "fulfilled") setGames(mergeLiveBasketballForecasts(initialGames, forecastResult.value));
      if (marketResult.status === "fulfilled") setMarketComparisons(marketResult.value);
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
    const market = summarizeMarketLines(marketComparisons[game.id] || game.market_comparisons || []);
    return market.spread != null || market.total != null;
  }).length;
  const orderedSignalGames = sortForecastBoard(signalGames, sort);
  const downloadVisibleCsv = () => downloadCsv(
    "basketball-forecast-board.csv",
    toCsv(forecastCsvHeaders, forecastCsvRows(rows, marketComparisons, rosterScenarios, ratings)),
  );
  const downloadAllCsv = () => downloadCsv(
    "basketball-forecast-board-filtered.csv",
    toCsv(forecastCsvHeaders, forecastCsvRows(orderedSignalGames, marketComparisons, rosterScenarios, ratings)),
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
          <tr><th>Game</th><th>Tip</th><th>Model</th><th className="numeric">Projected</th><th className="numeric">Home win</th><th className="numeric">Margin</th><th className="numeric">Tempo</th><th className="numeric">Factor edge</th><th className="numeric">Team ratings</th><th className="numeric">Roster lens</th><th className="numeric">Market</th><th className="numeric">Model − line</th><th className="numeric">Range</th><th className="numeric">Total</th></tr>
        </thead>
        <tbody>
          {rows.map((game) => {
            const prediction = predictionFor(game)!;
            const rosterScenario = rosterByGame.get(game.id);
            const homeRating = ratingById.get(game.home_id);
            const awayRating = ratingById.get(game.away_id);
            const market = summarizeMarketLines(marketComparisons[game.id] || game.market_comparisons || []);
            const factorEdges = matchupFactorEdges(game);
            return (
              <tr key={game.id}>
                <th scope="row"><Link href={`/basketball/matchups/?game=${encodeURIComponent(game.id)}`}><strong>{game.away_name}</strong><small>at {game.home_name}</small></Link><small><Link href={`/blog/basketball-game-${encodeURIComponent(game.id)}/`}>Read game notebook →</Link></small></th>
                <td>{date(game.starts_at)}<small>{latestTip(game)}</small><small>{tipStatus(game)}</small></td>
                <td><span className={`model-tag ${game.prediction ? "primary" : "baseline"}`}>{modelLabel(game)}</span><small>{forecastSignal(prediction).label}</small></td>
                <td className="numeric"><strong>{fmt(prediction.away_score)}–{fmt(prediction.home_score)}</strong><small>{prediction.home_win_probability >= 0.5 ? game.home_name : game.away_name} projected winner</small></td>
                <td className="numeric"><strong>{fmt(prediction.home_win_probability * 100)}%</strong></td>
                <td className="numeric">{prediction.home_margin >= 0 ? "+" : ""}{fmt(prediction.home_margin)}</td>
                <td className="numeric"><strong>{fmt(prediction.pace)}</strong><small>possessions</small></td>
                <td className="numeric">
                  {strongestFactorEdge(game) || "—"}<small>largest Four Factor edge</small>
                  {factorEdges.length > 0 && <details className="forecast-factor-details"><summary>All four</summary>{factorEdges.map((edge) => <small key={edge.key}>{factorLabels[edge.key]} {edge.value >= 0 ? "H" : "A"} {fmt(Math.abs(edge.value) * 100, 1)}</small>)}</details>}
                </td>
                <td className="numeric">{homeRating || awayRating ? <details className="forecast-factor-details"><summary>Show ratings</summary>{homeRating ? <small>H {fmt(homeRating.adj_off)} off · {fmt(homeRating.adj_def)} def · {fmt(homeRating.adj_net)} net</small> : <small>H unavailable</small>}{awayRating ? <small>A {fmt(awayRating.adj_off)} off · {fmt(awayRating.adj_def)} def · {fmt(awayRating.adj_net)} net</small> : <small>A unavailable</small>}</details> : "—"}</td>
                <td className="numeric">{rosterScenario ? <><strong>{rosterScenario.roster_margin >= 0 ? "+" : ""}{fmt(rosterScenario.roster_margin)}</strong><small>{rosterScenario.margin_delta >= 0 ? "+" : ""}{fmt(rosterScenario.margin_delta)} vs base</small></> : "—"}</td>
                <td className="numeric">{market.spread == null && market.total == null ? "—" : <>{market.spread == null ? null : <span>H {market.spread >= 0 ? "+" : ""}{fmt(market.spread)}</span>}{market.total == null ? null : <small>O/U {fmt(market.total)}</small>}{market.capturedAt && <small>{date(market.capturedAt)}</small>}</>}</td>
                <td className="numeric">{market.spreadGap == null && market.totalGap == null ? "—" : <>{market.spreadGap == null ? null : <span>{market.spreadGap >= 0 ? "+" : ""}{fmt(market.spreadGap)} spread</span>}{market.totalGap == null ? null : <small>{market.totalGap >= 0 ? "+" : ""}{fmt(market.totalGap)} total</small>}</>}</td>
                <td className="numeric">{prediction.margin_low >= 0 ? "+" : ""}{fmt(prediction.margin_low)} to {prediction.margin_high >= 0 ? "+" : ""}{fmt(prediction.margin_high)}<small>calibrated margin band</small></td>
                <td className="numeric">{fmt(prediction.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
