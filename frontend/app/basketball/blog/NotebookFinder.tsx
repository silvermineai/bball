"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";
import { date, fmt, signed } from "../../_lib/format";
import { loadLiveBasketballForecasts } from "../../_lib/live-basketball-forecasts";
import {
  notebookSearchParams,
  readNotebookSearch,
  searchNotebookGames,
  type NotebookIndexGame,
} from "./notebook-index";

export default function NotebookFinder({
  games,
  total,
}: {
  games: NotebookIndexGame[];
  total: number;
}) {
  const [query, setQuery] = useState("");
  const [liveGames, setLiveGames] = useState<NotebookIndexGame[] | null>(null);
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "live" | "error">("idle");
  const [hydrated, setHydrated] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const isSearching = deferredQuery.trim().length > 0;
  const results = isSearching && !liveGames
    ? lookupStatus === "error" ? games : []
    : searchNotebookGames(liveGames || games, deferredQuery, 8);

  useEffect(() => {
    setQuery(readNotebookSearch(new URLSearchParams(window.location.search)));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("notebookQ");
    notebookSearchParams(query).forEach((value, key) => url.searchParams.set(key, value));
    window.history.replaceState(window.history.state, "", url);
  }, [hydrated, query]);

  useEffect(() => {
    if (!query.trim() || liveGames) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLookupStatus("loading");
      loadLiveBasketballForecasts(controller.signal)
        .then((rows) => {
          if (controller.signal.aborted) return;
          const complete = rows.flatMap((row): NotebookIndexGame[] => {
            const prediction = row.prediction;
            if (!row.away_name || !row.home_name || !prediction) return [];
            const numeric = [
              prediction.away_score,
              prediction.home_score,
              prediction.home_win_probability,
              prediction.margin_low,
              prediction.margin_high,
            ];
            if (numeric.some((value) => !Number.isFinite(value))) return [];
            return [{
              id: row.game_id,
              startsAt: row.starts_at,
              awayId: row.away_id,
              awayName: row.away_name,
              homeId: row.home_id,
              homeName: row.home_name,
              neutral: Boolean(row.neutral),
              timeTbd: Boolean(row.time_tbd),
              forecast: {
                awayScore: prediction.away_score,
                homeScore: prediction.home_score,
                homeWinProbability: prediction.home_win_probability,
                marginLow: prediction.margin_low,
                marginHigh: prediction.margin_high,
                estimateType: prediction.estimate_type === "cold_start" ? "cold_start" : "primary",
              },
            }];
          });
          setLiveGames(complete);
          setLookupStatus("live");
        })
        .catch(() => {
          if (!controller.signal.aborted) setLookupStatus("error");
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [liveGames, query]);

  return (
    <section className="notebook-finder" aria-labelledby="notebook-finder-title">
      <div className="notebook-finder-heading">
        <div>
          <div className="eyebrow">Full 2026–27 notebook index</div>
          <h2 id="notebook-finder-title">Find your team. Open the evidence.</h2>
        </div>
        <span>{total.toLocaleString()} forecast-backed games</span>
      </div>
      <label className="control notebook-finder-search">
        <span>TEAM, MATCHUP OR SOURCE ID</span>
        <input
          type="search"
          value={query}
          maxLength={120}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try Duke, UCLA or St. John’s"
        />
      </label>
      <p className="note notebook-finder-note" role="status">
        {isSearching
          ? lookupStatus === "loading" || lookupStatus === "idle"
            ? "Loading the complete live notebook index…"
            : lookupStatus === "error"
              ? "Live full-slate lookup is temporarily unavailable. The next eight notebooks remain below."
              : results.length
            ? `Showing the next ${results.length} matching game${results.length === 1 ? "" : "s"}.`
            : "No forecast-backed notebooks match this search."
          : "Showing the next eight games. Search any program to move through the full slate. This search is preserved in the URL for staff handoff."}
      </p>
      <div className="notebook-finder-results">
        {results.map((game) => {
          const forecast = game.forecast;
          return (
            <article className="notebook-finder-game" key={game.id}>
              <div className="notebook-finder-date">
                <span>{date(game.startsAt)}</span>
                <small>
                  {game.timeTbd ? "Start time unconfirmed" : game.neutral ? "Neutral court" : "Home court"}
                </small>
              </div>
              <div className="notebook-finder-matchup">
                <div className="eyebrow">
                  {forecast.estimateType === "cold_start"
                    ? "Cold-start estimate"
                    : "Published forecast"}
                </div>
                <h3>{game.awayName} <span>at</span> {game.homeName}</h3>
                <p>
                  Projected {fmt(forecast.awayScore)}–{fmt(forecast.homeScore)} · {fmt(forecast.homeWinProbability * 100)}% home win
                </p>
              </div>
              <div className="notebook-finder-range">
                <span>80% home-margin range</span>
                <strong>{signed(forecast.marginLow)} to {signed(forecast.marginHigh)}</strong>
              </div>
              <div className="notebook-finder-links">
                <Link href={`/basketball/briefs/${encodeURIComponent(game.id)}/`}>
                  Evidence brief →
                </Link>
                <Link href={`/blog/basketball-game-${encodeURIComponent(game.id)}/`}>
                  Notebook
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      <p className="note">
        Open the evidence brief for the forecast range, Four Factors, roster
        coverage and source trail. Cold-start estimates use wider uncertainty
        and stay labeled throughout the notebook. <Link href="/basketball/briefs/">Browse the complete briefing room →</Link>
      </p>
    </section>
  );
}
