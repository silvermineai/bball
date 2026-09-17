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

/** Replace the first landing-page slice with the current forecast catalog. */
export default function LiveFootballDashboardForecastTable({
  initialGames,
}: {
  initialGames: Game[];
}) {
  const [games, setGames] = useState(initialGames);
  const [sort, setSort] = useState<FootballMatchupSort>("date");
  const [signal, setSignal] = useState<FootballMatchupSignal>("all");

  useEffect(() => {
    const controller = new AbortController();
    loadLiveFootballForecasts(controller.signal, { maxPages: 1 })
      .then((rows) => {
        if (!controller.signal.aborted) {
          setGames(mergeLiveFootballForecasts(initialGames, rows));
        }
      })
      .catch(() => {
        // Keep the server-rendered edition visible if the live catalog is
        // temporarily unavailable; the status line reports that separately.
      });
    return () => controller.abort();
  }, [initialGames]);

  const forecastedGames = games.filter((game) => game.prediction);
  const signalGames = forecastedGames.filter((game) => matchesFootballMatchupSignal(game.prediction, signal));
  const rows = sortFootballMatchups(signalGames, sort).slice(0, 12);
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
        <p className="note" role="status">Showing {rows.length} of {signalGames.length} forecast rows · {signalLabels[signal]} · {sortLabels[sort]}.</p>
      </div>
      <div className="dashboard-table-wrap">
        <table className="data-table dashboard-table forecast-table">
        <thead>
          <tr><th>Game</th><th>Kickoff</th><th className="numeric">Projected</th><th className="numeric">Home win</th><th className="numeric">Margin</th><th className="numeric">Range</th><th className="numeric">Total</th></tr>
        </thead>
        <tbody>
          {rows.map((game) => {
            const prediction = game.prediction!;
            return (
              <tr key={game.id}>
                <th scope="row"><Link href={`/football/matchups/?team=${encodeURIComponent(game.home_name)}`}><strong>{game.away_name}</strong><small>at {game.home_name}</small></Link></th>
                <td>{date(game.kickoff)}<small>{latestTip(game)}</small></td>
                <td className="numeric"><strong>{fmt(prediction.away_score)}–{fmt(prediction.home_score)}</strong></td>
                <td className="numeric"><strong>{fmt(prediction.home_win_probability * 100)}%</strong></td>
                <td className="numeric">{prediction.home_margin >= 0 ? "+" : ""}{fmt(prediction.home_margin)}</td>
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
