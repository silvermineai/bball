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

function modelLabel(game: BBGame) {
  return game.prediction ? "SILVERMINE MODEL" : "SILVERMINE COLD START";
}

export default function LiveDashboardForecastTable({
  initialGames,
}: {
  initialGames: BBGame[];
}) {
  const [games, setGames] = useState(initialGames);

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

  const rows = games.filter((game) => predictionFor(game)).slice(0, 12);
  return (
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
                <th scope="row"><Link href={`/basketball/matchups/?game=${encodeURIComponent(game.id)}`}><strong>{game.away_name}</strong><small>at {game.home_name}</small></Link></th>
                <td>{date(game.starts_at)}<small>{latestTip(game)}</small></td>
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
  );
}
