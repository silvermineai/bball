"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BBFactorKey, BBGame, BBTeam } from "../_lib/basketball-types";
import type { Comparison } from "../_lib/research-types";
import { date, fmt, kick } from "../_lib/format";
import { basketballEditorialLens } from "../_lib/basketball-editorial";
import { comparisonQuoteSummary } from "../_lib/market-display";
import { downloadCsv, toCsv } from "../_lib/csv";
import {
  loadLiveBasketballForecasts,
  loadLiveBasketballMarketComparisons,
  mergeLiveBasketballForecasts,
  publishedBasketballPrediction,
} from "../_lib/live-basketball-forecasts";

const PREP_LIST_KEY = "silvermine-basketball-prep-list-v1";
const factorLabels: Record<BBFactorKey, string> = { efg: "eFG%", tov: "TO%", orb: "ORB%", ftr: "FTR" };
type SavedGame = Pick<BBGame, "id" | "starts_at" | "away_name" | "home_name" | "source_start" | "source_time_valid"> & {
  prediction: NonNullable<BBGame["prediction"]>;
  marketContext?: string | null;
};

export default function LiveBasketballJournal({ games, ratings = [] }: { games: BBGame[]; ratings?: BBTeam[] }) {
  const [activeGames, setActiveGames] = useState(games);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");
  const [edition, setEdition] = useState<{ modelId: string; capturedAt: string } | null>(null);
  const [markets, setMarkets] = useState<Record<string, Comparison[]>>({});
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedGames, setSavedGames] = useState<Record<string, SavedGame>>({});
  const [savedMessage, setSavedMessage] = useState("");
  const ratingsById = new Map(ratings.map((team) => [team.id, team]));

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(PREP_LIST_KEY) || "[]") as unknown;
      if (Array.isArray(saved)) {
        setSavedIds(saved.filter((id): id is string => typeof id === "string" && id.length <= 80));
      } else if (saved && typeof saved === "object") {
        const value = saved as { ids?: unknown; games?: unknown };
        if (Array.isArray(value.ids)) setSavedIds(value.ids.filter((id): id is string => typeof id === "string" && id.length <= 80));
        if (value.games && typeof value.games === "object") setSavedGames(value.games as Record<string, SavedGame>);
      }
    } catch {
      // A blocked storage API leaves the journal usable for the current visit.
    }
  }, []);

  const toggleSaved = (gameId: string) => {
    const game = activeGames.find((item) => item.id === gameId);
    const prediction = game ? publishedBasketballPrediction(game) : null;
    if (!game || !prediction) return;
    setSavedIds((current) => {
      const removing = current.includes(gameId);
      const next = removing ? current.filter((id) => id !== gameId) : [...current, gameId].slice(-30);
      setSavedGames((existing) => {
        const updated = { ...existing };
        if (removing) delete updated[gameId];
        else updated[gameId] = {
          id: game.id,
          starts_at: game.starts_at,
          away_name: game.away_name,
          home_name: game.home_name,
          source_start: game.source_start,
          source_time_valid: game.source_time_valid,
          prediction,
          marketContext: markets[game.id]?.slice(0, 2).map(comparisonQuoteSummary).join(" · ") || null,
        };
        try { window.localStorage.setItem(PREP_LIST_KEY, JSON.stringify({ ids: next, games: updated })); } catch { /* optional storage */ }
        return updated;
      });
      setSavedMessage(removing ? "Removed from prep list." : "Saved forecast snapshot to prep list.");
      return next;
    });
  };

  const exportPrepList = () => {
    const rows = savedIds.map((id) => {
      const live = activeGames.find((game) => game.id === id);
      return live?.prediction ? {
        id: live.id,
        starts_at: live.starts_at,
        away_name: live.away_name,
        home_name: live.home_name,
        source_start: live.source_start,
        source_time_valid: live.source_time_valid,
        prediction: live.prediction,
        marketContext: markets[live.id]?.slice(0, 2).map(comparisonQuoteSummary).join(" · ") || savedGames[id]?.marketContext || null,
      } satisfies SavedGame : savedGames[id];
    }).filter((game): game is SavedGame => Boolean(game?.prediction));
    if (!rows.length) return;
    downloadCsv("basketball-prep-list.csv", toCsv(
      ["Game ID", "Start (UTC)", "Recorded start (UTC)", "Time valid", "Away", "Home", "Model home margin", "Model total", "Home win probability", "Margin low", "Margin high", "Model edition", "Verified market context"],
      rows.map((game) => {
        const p = game.prediction!;
        return [game.id, game.starts_at, game.source_start || null, game.source_time_valid == null ? null : game.source_time_valid ? "yes" : "no", game.away_name, game.home_name, p.home_margin, p.total, p.home_win_probability * 100, p.margin_low, p.margin_high, edition?.modelId || null, game.marketContext || null];
      }),
    ));
    setSavedMessage(`Exported ${rows.length} saved game${rows.length === 1 ? "" : "s"}.`);
  };

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
      {savedIds.length > 0 && <div className="journal-prep-list" role="status">
        <div><strong>{savedIds.length}</strong><span>game{savedIds.length === 1 ? "" : "s"} in your private prep list</span></div>
        <div className="button-row"><button className="button secondary" type="button" onClick={exportPrepList}>Export prep list ↓</button><button className="hero-link" type="button" onClick={() => { setSavedIds([]); setSavedGames({}); try { window.localStorage.removeItem(PREP_LIST_KEY); } catch { /* optional storage */ } setSavedMessage("Prep list cleared."); }}>Clear list</button></div>
        {savedMessage && <small>{savedMessage}</small>}
      </div>}
      <div className="article-grid">
        {activeGames
          .filter((g) => publishedBasketballPrediction(g))
          .slice(0, 6)
          .map((g) => {
            const p = publishedBasketballPrediction(g);
            if (!p) return null;
            const lens = basketballEditorialLens(g);
            const sourceClock = g.source_time_valid && g.source_start ? ` · schedule clock ${kick(g.source_start)}` : "";
            const awayRating = ratingsById.get(g.away_id);
            const homeRating = ratingsById.get(g.home_id);
            const factorEdges = Object.entries(g.matchup_factors?.edges || {})
              .filter((entry): entry is [BBFactorKey, number] => Number.isFinite(entry[1]))
              .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
            return <article className="article-card" key={g.id}>
              <div className="eyebrow">
                {date(g.starts_at)} · {p.estimate_type === "cold_start" ? "Cold-start estimate" : "Model brief"}{sourceClock}
              </div>
              <h2>
                {g.away_name} vs {g.home_name}
              </h2>
              <p>
                Projected {p.away_score.toFixed(1)}–{p.home_score.toFixed(1)} · {Math.round(p.home_win_probability * 100)}% home win · {p.total.toFixed(1)} total.
              </p>
              <p className="note">
                {p.margin_low.toFixed(1)} to {p.margin_high.toFixed(1)} home-margin range · {p.pace.toFixed(1)} possessions per 40 minutes.
              </p>
              {p.estimate_type === "cold_start" && <p className="note">
                Exploratory estimate: at least one program is outside the trained field, so use the wider range as the main context.
              </p>}
              {(awayRating || homeRating || factorEdges.length > 0) && <dl className="journal-statline">
                {(awayRating || homeRating) && <div><dt>Latest team net</dt><dd>{g.away_name} {awayRating ? fmt(awayRating.adj_net, 1) : "—"} · {g.home_name} {homeRating ? fmt(homeRating.adj_net, 1) : "—"}</dd></div>}
                {factorEdges.length > 0 && <div><dt>Four Factor edges</dt><dd>{factorEdges.map(([key, edge]) => `${edge > 0 ? g.home_name : g.away_name} ${factorLabels[key]} ${fmt(Math.abs(edge) * 100, 1)}`).join(" · ")}</dd></div>}
              </dl>}
              {lens && <>
                <p className="journal-editorial-lens"><strong>{lens.title}.</strong> {lens.body}</p>
                <p className="note"><strong>Reporting question:</strong> {lens.questions[0]}</p>
              </>}
              {markets[g.id]?.length ? <p className="note">
                {markets[g.id].slice(0, 2).map(comparisonQuoteSummary).join(" · ")}
              </p> : null}
              <Link href={`/blog/basketball-game-${g.id}/`}>
                Read the notebook →
              </Link>
              <Link className="note" href={`/basketball/briefs/${g.id}/`}>
                Open the evidence brief →
              </Link>
              <button className="journal-prep-toggle" type="button" aria-pressed={savedIds.includes(g.id)} onClick={() => toggleSaved(g.id)}>
                {savedIds.includes(g.id) ? "✓ Saved to prep list" : "Save to prep list"}
              </button>
            </article>;
          })}
      </div>
    </>
  );
}
