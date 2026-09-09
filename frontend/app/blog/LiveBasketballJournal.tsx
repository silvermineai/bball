"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BBGame } from "../_lib/basketball-types";
import { date } from "../_lib/format";
import {
  loadLiveBasketballForecasts,
  mergeLiveBasketballForecasts,
} from "../_lib/live-basketball-forecasts";

export default function LiveBasketballJournal({ games }: { games: BBGame[] }) {
  const [activeGames, setActiveGames] = useState(games);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");

  useEffect(() => {
    const controller = new AbortController();
    loadLiveBasketballForecasts(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) {
          setActiveGames(mergeLiveBasketballForecasts(games, rows));
          setStatus("live");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("fallback");
      });
    return () => controller.abort();
  }, [games]);

  return (
    <>
      <p className="note" role="status">
        {status === "live"
          ? "Live D1 forecasts connected; journal previews use the latest retained model rows."
          : status === "fallback"
            ? "Live forecast refresh unavailable; showing the bundled journal edition."
            : "Checking the live forecast edition…"}
      </p>
      <div className="article-grid">
        {activeGames
          .filter((g) => g.prediction)
          .slice(0, 6)
          .map((g) => (
            <article className="article-card" key={g.id}>
              <div className="eyebrow">{date(g.starts_at)} · Model brief</div>
              <h2>
                {g.away_name} vs {g.home_name}
              </h2>
              <p>
                Score estimates, pace, uncertainty and questions for the
                scouting room.
              </p>
              <Link href={`/basketball/briefs/${g.id}/`}>
                Read the preview →
              </Link>
            </article>
          ))}
      </div>
    </>
  );
}
