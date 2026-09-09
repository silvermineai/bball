"use client";

import { useEffect, useState } from "react";
import type { BBGame } from "../../../_lib/basketball-types";
import BasketballCard from "../../../_components/BasketballCard";
import {
  loadLiveBasketballForecasts,
  mergeLiveBasketballForecasts,
} from "../../../_lib/live-basketball-forecasts";

type Props = {
  initialGames: BBGame[];
  teamId: string;
  teamName: string;
};

/**
 * Keep a program dossier's look-ahead schedule aligned with the same live D1
 * edition used by the matchup desk. The static dossier remains a useful
 * fallback when the API is unavailable.
 */
export default function LiveProgramSchedule({ initialGames, teamId, teamName }: Props) {
  const [games, setGames] = useState(initialGames);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");
  const [modelId, setModelId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    loadLiveBasketballForecasts(controller.signal, { query: teamName, maxPages: 1 })
      .then((rows) => {
        if (controller.signal.aborted) return;
        const merged = mergeLiveBasketballForecasts(initialGames, rows).filter(
          (game) => game.home_id === teamId || game.away_id === teamId,
        );
        setGames(merged);
        setModelId(rows.find((row) => row.model_id)?.model_id || "");
        setStatus("live");
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setStatus("fallback");
        }
      });
    return () => controller.abort();
  }, [initialGames, teamId, teamName]);

  return (
    <>
      <p className="note" role="status">
        {status === "live"
          ? `Live D1 schedule connected${modelId ? ` · ${modelId}` : ""}. Forecast cards use the latest stored edition.`
          : status === "fallback"
            ? "Live schedule refresh unavailable; showing the published dossier edition."
            : "Checking the live schedule edition…"}
      </p>
      {games.length ? (
        <div className="match-grid">
          {games.slice(0, 3).map((game) => <BasketballCard key={game.id} game={game} />)}
        </div>
      ) : (
        <p className="empty">No upcoming games for this program in the partial schedule.</p>
      )}
    </>
  );
}
