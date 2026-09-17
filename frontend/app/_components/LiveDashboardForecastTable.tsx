"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BBGame } from "../_lib/basketball-types";
import { fmt, kick, date } from "../_lib/format";
import {
  loadLiveBasketballForecasts,
  mergeLiveBasketballForecasts,
} from "../_lib/live-basketball-forecasts";

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

export default function LiveDashboardForecastTable({
  initialGames,
}: {
  initialGames: BBGame[];
}) {
  const [games, setGames] = useState(initialGames);
  const [sort, setSort] = useState<ForecastBoardSort>("start");

  useEffect(() => {
    const controller = new AbortController();
    loadLiveBasketballForecasts(controller.signal, { maxPages: 1 })
      .then((rows) => {
        if (!controller.signal.aborted) {
          setGames(mergeLiveBasketballForecasts(initialGames, rows));
        }
      })
      .catch(() => {
        // The server-rendered edition remains useful when the live catalog is
        // temporarily unavailable; the status line reports that separately.
      });
    return () => controller.abort();
  }, [initialGames]);

  const rows = sortForecastBoard(games.filter((game) => predictionFor(game)), sort).slice(0, 12);
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
        <p className="note" role="status">
          Showing {rows.length} of {games.filter((game) => predictionFor(game)).length} forecast rows · {sort === "start" ? "earliest tips first" : sort === "confidence" ? "most certain outcomes first" : "largest projected edges first"}.
        </p>
      </div>
      <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table forecast-table">
        <thead>
          <tr><th>Game</th><th>Tip</th><th>Model</th><th className="numeric">Projected</th><th className="numeric">Home win</th><th className="numeric">Margin</th><th className="numeric">Range</th><th className="numeric">Total</th></tr>
        </thead>
        <tbody>
          {rows.map((game) => {
            const prediction = predictionFor(game)!;
            return (
              <tr key={game.id}>
                <th scope="row"><Link href={`/basketball/matchups/?game=${encodeURIComponent(game.id)}`}><strong>{game.away_name}</strong><small>at {game.home_name}</small></Link><small><Link href={`/blog/basketball-game-${encodeURIComponent(game.id)}/`}>Read game notebook →</Link></small></th>
                <td>{date(game.starts_at)}<small>{latestTip(game)}</small><small>{tipStatus(game)}</small></td>
                <td><span className={`model-tag ${game.prediction ? "primary" : "baseline"}`}>{modelLabel(game)}</span></td>
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
