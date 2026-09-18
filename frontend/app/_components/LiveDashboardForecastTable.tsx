"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BBFactorKey, BBGame, BBRosterScenario } from "../_lib/basketball-types";
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
  const edges = game.matchup_factors?.edges;
  if (!edges) return null;
  const strongest = (Object.entries(edges) as Array<[BBFactorKey, number | undefined]>)
    .filter((entry): entry is [BBFactorKey, number] => entry[1] != null && Number.isFinite(entry[1]))
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))[0];
  if (!strongest || strongest[1] === 0) return null;
  const [key, edge] = strongest;
  return `${edge > 0 ? "H" : "A"} ${factorLabels[key]} ${fmt(Math.abs(edge) * 100, 1)}`;
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
}: {
  initialGames: BBGame[];
  rosterScenarios?: BBRosterScenario[];
}) {
  const [games, setGames] = useState(initialGames);
  const [sort, setSort] = useState<ForecastBoardSort>("start");
  const [signal, setSignal] = useState<MatchupSignal>("all");
  const [estimate, setEstimate] = useState<ForecastEstimateFilter>("all");
  const [rowLimit, setRowLimit] = useState<12 | 24 | 48>(12);
  const [marketComparisons, setMarketComparisons] = useState<Record<string, Comparison[]>>({});

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      loadLiveBasketballForecasts(controller.signal, { maxPages: 1 }),
      loadLiveBasketballMarketComparisons(controller.signal),
    ]).then(([forecastResult, marketResult]) => {
      if (controller.signal.aborted) return;
      if (forecastResult.status === "fulfilled") setGames(mergeLiveBasketballForecasts(initialGames, forecastResult.value));
      if (marketResult.status === "fulfilled") setMarketComparisons(marketResult.value);
    });
    return () => controller.abort();
  }, [initialGames]);

  const forecastedGames = games.filter((game) => matchesEstimateFilter(game, estimate));
  const signalGames = forecastedGames.filter((game) => matchesMatchupSignal(predictionFor(game), signal));
  const rows = sortForecastBoard(signalGames, sort).slice(0, rowLimit);
  const rosterByGame = new Map(rosterScenarios.map((scenario) => [scenario.game_id, scenario]));
  const marketGames = signalGames.filter((game) => {
    const market = summarizeMarketLines(marketComparisons[game.id] || game.market_comparisons || []);
    return market.spread != null || market.total != null;
  }).length;
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
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
        <p className="note" role="status">
          Showing {rows.length} of {signalGames.length} forecast rows · {signalLabels[signal]} · {sort === "start" ? "earliest tips first" : sort === "confidence" ? "most certain outcomes first" : "largest projected edges first"} · {marketGames} with qualifying market lines.
        </p>
      </div>
      <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table forecast-table">
        <thead>
          <tr><th>Game</th><th>Tip</th><th>Model</th><th className="numeric">Projected</th><th className="numeric">Home win</th><th className="numeric">Margin</th><th className="numeric">Tempo</th><th className="numeric">Factor edge</th><th className="numeric">Roster lens</th><th className="numeric">Market</th><th className="numeric">Model − line</th><th className="numeric">Range</th><th className="numeric">Total</th></tr>
        </thead>
        <tbody>
          {rows.map((game) => {
            const prediction = predictionFor(game)!;
            const rosterScenario = rosterByGame.get(game.id);
            const market = summarizeMarketLines(marketComparisons[game.id] || game.market_comparisons || []);
            return (
              <tr key={game.id}>
                <th scope="row"><Link href={`/basketball/matchups/?game=${encodeURIComponent(game.id)}`}><strong>{game.away_name}</strong><small>at {game.home_name}</small></Link><small><Link href={`/blog/basketball-game-${encodeURIComponent(game.id)}/`}>Read game notebook →</Link></small></th>
                <td>{date(game.starts_at)}<small>{latestTip(game)}</small><small>{tipStatus(game)}</small></td>
                <td><span className={`model-tag ${game.prediction ? "primary" : "baseline"}`}>{modelLabel(game)}</span><small>{forecastSignal(prediction).label}</small></td>
                <td className="numeric"><strong>{fmt(prediction.away_score)}–{fmt(prediction.home_score)}</strong><small>{prediction.home_win_probability >= 0.5 ? game.home_name : game.away_name} projected winner</small></td>
                <td className="numeric"><strong>{fmt(prediction.home_win_probability * 100)}%</strong></td>
                <td className="numeric">{prediction.home_margin >= 0 ? "+" : ""}{fmt(prediction.home_margin)}</td>
                <td className="numeric"><strong>{fmt(prediction.pace)}</strong><small>possessions</small></td>
                <td className="numeric">{strongestFactorEdge(game) || "—"}<small>largest Four Factor edge</small></td>
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
