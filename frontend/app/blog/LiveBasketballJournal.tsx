"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BBGame } from "../_lib/basketball-types";
import type { Comparison } from "../_lib/research-types";
import { date } from "../_lib/format";
import { basketballEditorialLens } from "../_lib/basketball-editorial";
import { comparisonQuoteSummary } from "../_lib/market-display";
import { downloadCsv, toCsv } from "../_lib/csv";
import {
  loadLiveBasketballForecasts,
  loadLiveBasketballMarketComparisons,
  mergeLiveBasketballForecasts,
} from "../_lib/live-basketball-forecasts";

const PREP_LIST_KEY = "silvermine-basketball-prep-list-v1";

export default function LiveBasketballJournal({ games }: { games: BBGame[] }) {
  const [activeGames, setActiveGames] = useState(games);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");
  const [edition, setEdition] = useState<{ modelId: string; capturedAt: string } | null>(null);
  const [markets, setMarkets] = useState<Record<string, Comparison[]>>({});
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(PREP_LIST_KEY) || "[]") as unknown;
      if (Array.isArray(saved)) setSavedIds(saved.filter((id): id is string => typeof id === "string" && id.length <= 80));
    } catch {
      // A blocked storage API leaves the journal usable for the current visit.
    }
  }, []);

  const toggleSaved = (gameId: string) => {
    setSavedIds((current) => {
      const next = current.includes(gameId) ? current.filter((id) => id !== gameId) : [...current, gameId].slice(-30);
      try { window.localStorage.setItem(PREP_LIST_KEY, JSON.stringify(next)); } catch { /* optional storage */ }
      setSavedMessage(current.includes(gameId) ? "Removed from prep list." : "Saved to prep list.");
      return next;
    });
  };

  const exportPrepList = () => {
    const rows = activeGames.filter((game) => savedIds.includes(game.id) && game.prediction);
    if (!rows.length) return;
    downloadCsv("basketball-prep-list.csv", toCsv(
      ["Game ID", "Start (UTC)", "Away", "Home", "Model home margin", "Model total", "Home win probability", "Margin low", "Margin high", "Model edition"],
      rows.map((game) => {
        const p = game.prediction!;
        return [game.id, game.starts_at, game.away_name, game.home_name, p.home_margin, p.total, p.home_win_probability * 100, p.margin_low, p.margin_high, edition?.modelId || null];
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
        <div className="button-row"><button className="button secondary" type="button" onClick={exportPrepList}>Export prep list ↓</button><button className="hero-link" type="button" onClick={() => { setSavedIds([]); try { window.localStorage.removeItem(PREP_LIST_KEY); } catch { /* optional storage */ } setSavedMessage("Prep list cleared."); }}>Clear list</button></div>
        {savedMessage && <small>{savedMessage}</small>}
      </div>}
      <div className="article-grid">
        {activeGames
          .filter((g) => g.prediction)
          .slice(0, 6)
          .map((g) => {
            const p = g.prediction;
            if (!p) return null;
            const lens = basketballEditorialLens(g);
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
