"use client";

import { useEffect, useState } from "react";
import BasketballCard from "./BasketballCard";
import type { BBGame, BBRosterScenario, BBRosterSummary } from "../_lib/basketball-types";
import { fetchLiveForecast, mergeLiveForecast } from "../_lib/live-basketball-forecasts";

/**
 * Refresh the small homepage slate without making the full static export
 * depend on a Worker response. Exact game IDs keep this update auditable and
 * prevent a name or date match from replacing a featured card.
 */
export default function LiveBasketballSlate({
  games,
  rosterSummaries,
  rosterScenarios,
}: {
  games: BBGame[];
  rosterSummaries: BBRosterSummary[];
  rosterScenarios: BBRosterScenario[];
}) {
  const [activeGames, setActiveGames] = useState(games);

  useEffect(() => {
    const controller = new AbortController();
    const featured = games.slice(0, 3);
    if (!featured.length) return () => controller.abort();

    Promise.allSettled(
      featured.map(async (game) => {
        return fetchLiveForecast(game.id, controller.signal);
      }),
    )
      .then((results) => {
        if (controller.signal.aborted) return;
        const rows = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
        const byGame = new Map(rows.filter((row) => row != null).map((row) => [row.game_id, row]));
        setActiveGames(games.map((game) => mergeLiveForecast(game, byGame.get(game.id) || null)));
      })
      .catch(() => setActiveGames(games));

    return () => controller.abort();
  }, [games]);

  const rosterByTeam = new Map(rosterSummaries.map((summary) => [summary.team_id, summary]));
  const scenarioByGame = new Map(rosterScenarios.map((scenario) => [scenario.game_id, scenario]));
  const featured = activeGames.filter((game) => game.prediction || game.fallback_prediction).slice(0, 3);

  return (
    <div className="match-grid" aria-label="Featured 2026–27 basketball forecasts">
      {featured.map((game) => (
        <BasketballCard
          key={game.id}
          game={game}
          homeRoster={rosterByTeam.get(game.home_id)}
          awayRoster={rosterByTeam.get(game.away_id)}
          rosterScenario={scenarioByGame.get(game.id)}
        />
      ))}
    </div>
  );
}
