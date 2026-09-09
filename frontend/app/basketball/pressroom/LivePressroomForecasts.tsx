"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BBGame } from "../../_lib/basketball-types";
import { date, fmt, signed } from "../../_lib/format";
import {
  loadLiveBasketballForecasts,
  mergeLiveBasketballForecasts,
} from "../../_lib/live-basketball-forecasts";

const sourceGameUrl = (id: string) =>
  `https://www.espn.com/mens-college-basketball/game/_/gameId/${encodeURIComponent(id)}`;

function signal(game: BBGame) {
  const margin = Math.abs(game.prediction!.home_margin);
  if (margin < 2) return "A one-possession setup: the model sees little separation.";
  const favorite = game.prediction!.home_margin > 0 ? game.home_name : game.away_name;
  if (margin >= 10) return `${favorite} carries the clearest projected control in this slate.`;
  return `${favorite} has the model edge, with enough uncertainty to keep the matchup live.`;
}

function GameCard({ game }: { game: BBGame }) {
  const prediction = game.prediction!;
  return (
    <article className="article-card">
      <div className="eyebrow">{date(game.starts_at)} · {game.time_tbd ? "Start time unconfirmed" : "Scheduled"}</div>
      <h2>{game.away_name} <span className="brief-versus">at</span> {game.home_name}</h2>
      <p>{signal(game)}</p>
      <dl>
        <div><dt>Projected score</dt><dd>{game.away_name} {fmt(prediction.away_score, 1)} · {game.home_name} {fmt(prediction.home_score, 1)}</dd></div>
        <div><dt>Home win probability</dt><dd>{fmt(prediction.home_win_probability * 100, 1)}%</dd></div>
        <div><dt>Margin range</dt><dd>{signed(prediction.margin_low)} to {signed(prediction.margin_high)} home</dd></div>
        <div><dt>Projected pace</dt><dd>{fmt(prediction.pace, 1)} possessions</dd></div>
      </dl>
      <div className="brief-archive-links">
        <Link href={`/basketball/briefs/${game.id}/`}>Open scouting brief →</Link>
        <Link href={`/basketball/compare/?a=${game.away_id}&b=${game.home_id}`}>Compare programs</Link>
        <a href={sourceGameUrl(game.id)} target="_blank" rel="noreferrer">Open ESPN source game ↗</a>
      </div>
    </article>
  );
}

export default function LivePressroomForecasts({ games }: { games: BBGame[] }) {
  const [activeGames, setActiveGames] = useState(games);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");
  const [edition, setEdition] = useState<{ modelId: string; capturedAt: string } | null>(null);

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

  return (
    <>
      <p className="note" role="status">
        {status === "live"
          ? `Live D1 forecasts connected; press cards use ${edition?.modelId || "the latest retained model"}${edition?.capturedAt ? ` captured ${date(edition.capturedAt)}` : ""}.`
          : status === "fallback"
            ? "Live forecast refresh unavailable; showing the bundled press-room edition."
            : "Checking the live forecast edition…"}
      </p>
      <div className="article-grid">
        {activeGames.filter((game) => game.prediction).slice(0, 12).map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </>
  );
}
