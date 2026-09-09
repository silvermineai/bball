"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BBGame } from "../_lib/basketball-types";
import type { Comparison } from "../_lib/research-types";
import { date } from "../_lib/format";
import {
  loadLiveBasketballForecasts,
  loadLiveBasketballMarketComparisons,
  mergeLiveBasketballForecasts,
} from "../_lib/live-basketball-forecasts";

export default function LiveBasketballJournal({ games }: { games: BBGame[] }) {
  const [activeGames, setActiveGames] = useState(games);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");
  const [edition, setEdition] = useState<{ modelId: string; capturedAt: string } | null>(null);
  const [markets, setMarkets] = useState<Record<string, Comparison[]>>({});

  useEffect(() => {
    const controller = new AbortController();
    loadLiveBasketballForecasts(controller.signal, { maxPages: 1 })
      .then((rows) => {
        if (!controller.signal.aborted) {
          setActiveGames(mergeLiveBasketballForecasts(games, rows));
          if (rows[0]?.model_id && rows[0].created_at) setEdition({ modelId: rows[0].model_id, capturedAt: rows[0].created_at });
          setStatus("live");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("fallback");
      });
    return () => controller.abort();
  }, [games]);

  useEffect(() => {
    const controller = new AbortController();
    loadLiveBasketballMarketComparisons(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setMarkets(value);
      })
      .catch(() => {
        // Market evidence is optional; the forecast preview remains useful without it.
      });
    return () => controller.abort();
  }, []);

  return (
    <>
      <p className="note" role="status">
        {status === "live"
          ? `Live D1 forecasts connected; journal previews use ${edition?.modelId || "the latest retained model"}${edition?.capturedAt ? ` captured ${date(edition.capturedAt)}` : ""}.`
          : status === "fallback"
            ? "Live forecast refresh unavailable; showing the bundled journal edition."
            : "Checking the live forecast edition…"}
      </p>
      <div className="article-grid">
        {activeGames
          .filter((g) => g.prediction)
          .slice(0, 6)
          .map((g) => {
            const p = g.prediction;
            if (!p) return null;
            return <article className="article-card" key={g.id}>
              <div className="eyebrow">{date(g.starts_at)} · Model brief</div>
              <h2>
                {g.away_name} vs {g.home_name}
              </h2>
              <p>
                Projected {p.away_score.toFixed(1)}–{p.home_score.toFixed(1)} · {Math.round(p.home_win_probability * 100)}% home win · {p.total.toFixed(1)} total.
              </p>
              <p className="note">
                {p.margin_low.toFixed(1)} to {p.margin_high.toFixed(1)} home-margin range · {p.pace.toFixed(1)} possessions per 40 minutes.
              </p>
              {markets[g.id]?.length ? <p className="note">
                {markets[g.id].slice(0, 2).map((quote) => `${quote.bookmaker} ${quote.market}: ${quote.model_difference > 0 ? "+" : ""}${quote.model_difference.toFixed(1)} model difference`).join(" · ")}
              </p> : null}
              <Link href={`/basketball/briefs/${g.id}/`}>
                Read the preview →
              </Link>
            </article>;
          })}
      </div>
    </>
  );
}
