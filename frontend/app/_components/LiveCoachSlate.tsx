"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BBGame, BBRosterScenario } from "../_lib/basketball-types";
import { loadLiveBasketballForecasts, mergeLiveBasketballForecasts } from "../_lib/live-basketball-forecasts";
import { date, fmt } from "../_lib/format";

/**
 * Refreshes the coach desk from one bounded upcoming-slate request. The merge
 * is keyed only by immutable game ID, retaining the static export as first
 * paint and as a fallback when the API is unavailable.
 */
export default function LiveCoachSlate({
  games,
  rosterScenarios,
}: {
  games: BBGame[];
  rosterScenarios: BBRosterScenario[];
}) {
  const [activeGames, setActiveGames] = useState(games);

  useEffect(() => {
    const controller = new AbortController();
    if (!games.length) return () => controller.abort();

    loadLiveBasketballForecasts(controller.signal, { maxPages: 1 })
      .then((rows) => {
        if (controller.signal.aborted) return;
        setActiveGames(mergeLiveBasketballForecasts(games, rows));
      })
      .catch(() => setActiveGames(games));

    return () => controller.abort();
  }, [games]);

  const scenarioByGame = new Map(rosterScenarios.map((scenario) => [scenario.game_id, scenario]));
  const featured = activeGames.filter((game) => game.prediction || game.fallback_prediction).slice(0, 5);

  return (
    <div className="article-grid">
      {featured.map((game) => {
        const prediction = game.prediction || game.fallback_prediction;
        const rosterScenario = scenarioByGame.get(game.id);
        const confidence = prediction?.home_win_probability == null
          ? null
          : Math.max(prediction.home_win_probability, 1 - prediction.home_win_probability) * 100;
        return (
          <article className="article-card" key={game.id}>
            <div className="eyebrow">{date(game.starts_at)} · {game.neutral ? "Neutral" : "Home court"}</div>
            <h3>{game.away_name} at {game.home_name}</h3>
            <p>
              Model projects {fmt(prediction?.home_score)}–{fmt(prediction?.away_score)}
              {prediction?.home_win_probability != null
                ? ` · ${fmt(prediction.home_win_probability * 100)}% home win probability`
                : ""}.
            </p>
            <p className="note">
              {prediction?.margin_low != null && prediction.margin_high != null
                ? `80% margin range ${fmt(prediction.margin_low)} to ${fmt(prediction.margin_high)}`
                : "Margin range unavailable"}
              {confidence == null ? "" : ` · ${fmt(confidence)}% model confidence`}
              {rosterScenario ? ` · roster lens ${rosterScenario.margin_delta > 0 ? "+" : ""}${fmt(rosterScenario.margin_delta)} pts` : ""}
            </p>
            {rosterScenario && <small>Roster lens is research-only and does not replace the primary forecast.</small>}
            <Link href={`/basketball/briefs/${encodeURIComponent(game.id)}/`}>Open the game brief →</Link>
          </article>
        );
      })}
      {featured.length === 0 && <p className="note">No forecasted games are currently published. The matchup desk will fill as the schedule release arrives.</p>}
    </div>
  );
}
