"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Game } from "../_lib/data";
import { date, fmt, kick } from "../_lib/format";
import {
  loadLiveFootballForecasts,
  mergeLiveFootballForecasts,
} from "../_lib/live-football-forecasts";
import {
  sortFootballMatchups,
  type FootballMatchupSort,
} from "../_lib/football-matchup-view";
import {
  matchesFootballMatchupSignal,
  type FootballMatchupSignal,
} from "../_lib/football-matchup-view";
import { hasQualifiedMarketComparison, summarizeMarketLines } from "../_lib/market-display";
import { loadLiveFootballMarketComparisons } from "../_lib/live-football-forecasts";
import type { Comparison } from "../_lib/research-types";
import { downloadCsv, toCsv, type CsvCell } from "../_lib/csv";

const sortLabels: Record<FootballMatchupSort, string> = {
  date: "earliest kickoffs first",
  confidence: "most certain outcomes first",
  close: "closest projected margins first",
  margin: "largest projected edges first",
  uncertainty: "widest calibrated ranges first",
};
const signalLabels: Record<FootballMatchupSignal, string> = {
  all: "all model signals",
  "toss-up": "toss-ups under 60%",
  lean: "leans from 60–74.9%",
  strong: "strong leans at 75%+",
};

function latestTip(game: Game) {
  return game.time_tbd ? "Time TBD" : kick(game.kickoff);
}

function forecastSignal(game: Game) {
  const prediction = game.prediction;
  if (!prediction) return "";
  const confidence = Math.max(prediction.home_win_probability, 1 - prediction.home_win_probability);
  return confidence >= 0.75 ? "Strong lean" : confidence >= 0.6 ? "Lean" : "Toss-up";
}

export const footballForecastCsvHeaders = [
  "Game ID", "Kickoff", "Week", "Away", "Home", "Away conference", "Home conference", "Neutral site", "Time TBD",
  "Away score", "Home score", "Home win probability", "Projected margin", "Margin low", "Margin high", "Projected total",
  "Verified market spread", "Verified market total", "Spread gap", "Total gap", "Market capture", "Verified market home probability", "Moneyline probability gap",
];

/** Export the complete filtered football forecast cohort, retaining unavailable values as blanks. */
export function footballForecastCsvRows(
  games: Game[],
  marketComparisons: Record<string, Comparison[]> = {},
): CsvCell[][] {
  return games.map((game) => {
    const prediction = game.prediction;
    const market = summarizeMarketLines(marketComparisons[game.id] || game.market_comparisons || []);
    const legacy = game.market;
    const spread = market.spread ?? legacy?.home_spread ?? null;
    const total = market.total ?? legacy?.total ?? null;
    const spreadGap = market.spreadGap ?? legacy?.margin_difference ?? null;
    const totalGap = market.totalGap ?? (total != null && prediction?.total != null ? prediction.total - total : null);
    return [
      game.id, game.kickoff, game.week, game.away_name, game.home_name, game.away_conference, game.home_conference,
      game.neutral ? "yes" : "no", game.time_tbd ? "yes" : "no", prediction?.away_score, prediction?.home_score,
      prediction?.home_win_probability == null ? null : prediction.home_win_probability * 100, prediction?.home_margin,
      prediction?.margin_low, prediction?.margin_high, prediction?.total, spread, total, spreadGap, totalGap,
      market.capturedAt ?? legacy?.observed_at ?? null,
      market.homeProbability == null ? null : market.homeProbability * 100,
      market.winProbabilityGap == null ? null : market.winProbabilityGap * 100,
    ];
  });
}

/** Replace the first landing-page slice with the current forecast catalog. */
export default function LiveFootballDashboardForecastTable({
  initialGames,
}: {
  initialGames: Game[];
}) {
  const [games, setGames] = useState(initialGames);
  const [sort, setSort] = useState<FootballMatchupSort>("date");
  const [signal, setSignal] = useState<FootballMatchupSignal>("all");
  const [rowLimit, setRowLimit] = useState<12 | 24 | 48>(12);
  const [marketComparisons, setMarketComparisons] = useState<Record<string, Comparison[]>>({});

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      // Keep the football landing board aligned with the complete registered
      // edition; a first-page-only refresh leaves later games on static data.
      loadLiveFootballForecasts(controller.signal),
      loadLiveFootballMarketComparisons(controller.signal),
    ]).then(([forecastResult, marketResult]) => {
      if (controller.signal.aborted) return;
      if (forecastResult.status === "fulfilled") setGames(mergeLiveFootballForecasts(initialGames, forecastResult.value));
      if (marketResult.status === "fulfilled") setMarketComparisons(marketResult.value);
    });
    return () => controller.abort();
  }, [initialGames]);

  const forecastedGames = games.filter((game) => game.prediction);
  const signalGames = forecastedGames.filter((game) => matchesFootballMatchupSignal(game.prediction, signal));
  const rows = sortFootballMatchups(signalGames, sort).slice(0, rowLimit);
  const marketGames = signalGames.filter((game) => {
    const market = summarizeMarketLines(marketComparisons[game.id] || game.market_comparisons || []);
    return hasQualifiedMarketComparison(market);
  }).length;
  const downloadFilteredCsv = () => downloadCsv(
    "football-forecast-board.csv",
    toCsv(footballForecastCsvHeaders, footballForecastCsvRows(signalGames, marketComparisons)),
  );
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label className="control">
          <span>ORDER SLATE BY</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as FootballMatchupSort)}>
            <option value="date">Kickoff time</option>
            <option value="confidence">Model confidence</option>
            <option value="close">Closest projected margin</option>
            <option value="margin">Projected margin</option>
            <option value="uncertainty">Forecast range</option>
          </select>
        </label>
        <label className="control">
          <span>MODEL SIGNAL</span>
          <select value={signal} onChange={(event) => setSignal(event.target.value as FootballMatchupSignal)}>
            <option value="all">All forecast signals</option>
            <option value="toss-up">Toss-ups · under 60%</option>
            <option value="lean">Leans · 60–74.9%</option>
            <option value="strong">Strong leans · 75%+</option>
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
        <button className="button secondary" type="button" onClick={downloadFilteredCsv} disabled={!signalGames.length}>Download filtered CSV ↓</button>
        <p className="note" role="status">Showing {rows.length} of {signalGames.length} forecast rows · {signalLabels[signal]} · {sortLabels[sort]} · {marketGames} with qualifying market lines.</p>
      </div>
      <div className="dashboard-table-wrap">
        <table className="data-table dashboard-table forecast-table">
        <thead>
          <tr><th>Game</th><th>Kickoff</th><th className="numeric">Projected</th><th className="numeric">Home win</th><th className="numeric">Margin</th><th className="numeric">Market</th><th className="numeric">Model − line</th><th className="numeric">Range</th><th className="numeric">Total</th></tr>
        </thead>
        <tbody>
          {rows.map((game) => {
            const prediction = game.prediction!;
            const market = summarizeMarketLines(marketComparisons[game.id] || game.market_comparisons || []);
            return (
              <tr key={game.id}>
                <th scope="row"><Link href={`/football/matchups/?team=${encodeURIComponent(game.home_name)}`}><strong>{game.away_name}</strong><small>at {game.home_name}</small></Link></th>
                <td>{date(game.kickoff)}<small>{latestTip(game)}</small></td>
                <td className="numeric"><strong>{fmt(prediction.away_score)}–{fmt(prediction.home_score)}</strong><small>{prediction.home_win_probability >= 0.5 ? game.home_name : game.away_name} projected winner · {forecastSignal(game)}</small></td>
                <td className="numeric"><strong>{fmt(prediction.home_win_probability * 100)}%</strong></td>
                <td className="numeric">{prediction.home_margin >= 0 ? "+" : ""}{fmt(prediction.home_margin)}</td>
                <td className="numeric">{!hasQualifiedMarketComparison(market) ? "—" : <>{market.spread == null ? null : <span>H {market.spread >= 0 ? "+" : ""}{fmt(market.spread)}</span>}{market.total == null ? null : <small>O/U {fmt(market.total)}</small>}{market.homeProbability == null ? null : <small>ML {fmt(market.homeProbability * 100, 1)}% home</small>}{market.capturedAt && <small>{date(market.capturedAt)}</small>}</>}</td>
                <td className="numeric">{market.spreadGap == null && market.totalGap == null && market.winProbabilityGap == null ? "—" : <>{market.spreadGap == null ? null : <span>{market.spreadGap >= 0 ? "+" : ""}{fmt(market.spreadGap)} spread</span>}{market.totalGap == null ? null : <small>{market.totalGap >= 0 ? "+" : ""}{fmt(market.totalGap)} total</small>}{market.winProbabilityGap == null ? null : <small>{market.winProbabilityGap >= 0 ? "+" : ""}{fmt(market.winProbabilityGap * 100, 1)} pp ML</small>}</>}</td>
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
