"use client";

import { useEffect, useState } from "react";
import BasketballCard from "./BasketballCard";
import type { BBGame, BBRosterScenario, BBRosterSummary } from "../_lib/basketball-types";

type LiveForecastRow = {
  game_id: string;
  starts_at: string;
  home_id: string;
  away_id: string;
  home_name: string | null;
  away_name: string | null;
  neutral: number;
  time_tbd: number;
  venue: string | null;
  broadcast: string | null;
  source_start?: string | null;
  source_time_valid?: boolean | null;
  source_observed_at?: string | null;
  prediction: BBGame["prediction"];
};

type LiveForecastResponse = { rows?: LiveForecastRow[] };

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

    Promise.all(
      featured.map(async (game) => {
        const params = new URLSearchParams({
          season: "2027",
          gameId: game.id,
          status: "all",
          model: "latest",
          limit: "1",
        });
        const response = await fetch(`/api/basketball/research/forecasts?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Live featured forecasts unavailable.");
        const payload = await response.json() as LiveForecastResponse;
        return payload.rows?.[0] || null;
      }),
    )
      .then((rows) => {
        if (controller.signal.aborted) return;
        const byGame = new Map(rows.filter((row): row is LiveForecastRow => row != null).map((row) => [row.game_id, row]));
        setActiveGames(games.map((game) => {
          const row = byGame.get(game.id);
          if (!row || !row.home_name || !row.away_name) return game;
          return {
            ...game,
            starts_at: row.starts_at,
            home_id: row.home_id,
            away_id: row.away_id,
            home_name: row.home_name,
            away_name: row.away_name,
            neutral: row.neutral,
            time_tbd: row.time_tbd,
            venue: row.venue || game.venue,
            broadcast: row.broadcast || game.broadcast,
            source_start: row.source_start ?? game.source_start ?? null,
            source_time_valid: row.source_time_valid ?? game.source_time_valid ?? null,
            source_observed_at: row.source_observed_at ?? game.source_observed_at ?? null,
            prediction: row.prediction,
          } satisfies BBGame;
        }));
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") setActiveGames(games);
      });

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
