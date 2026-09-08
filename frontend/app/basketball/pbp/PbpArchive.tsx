"use client";

import { useEffect, useMemo, useState } from "react";
import type { PbpCatalog, PbpGame } from "../../_lib/pbp";
import { date, fmt } from "../../_lib/format";

const PAGE_SIZE = 40;

function sourceUrl(id: string) {
  return "https://www.espn.com/mens-college-basketball/game/_/gameId/" + encodeURIComponent(id);
}

export default function PbpArchive({
  catalogUrl,
  initial,
}: {
  catalogUrl: string;
  initial: PbpCatalog;
}) {
  const [catalog, setCatalog] = useState<PbpCatalog>(initial);
  const [season, setSeason] = useState(initial.default_season);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(catalogUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The play-by-play index is unavailable.");
        return response.json() as Promise<PbpCatalog>;
      })
      .then((value) => setCatalog(value))
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, [catalogUrl]);
  const active = catalog.seasons.find((entry) => entry.season === season) ?? catalog.seasons[0];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (active?.games ?? []).filter((game) =>
      !needle || [game.id, game.home, game.away].some((value) => value?.toLowerCase().includes(needle)),
    );
  }, [active, query]);
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  return (
    <section className="section">
      <div className="section-heading">
        <div><div className="eyebrow">Find a source game</div><h2>Every indexed possession trail.</h2></div>
        <span className="note">{active ? fmt(active.coverage.pbp_events || 0, 0) : "—"} events in view</span>
      </div>
      <div className="toolbar">
        <label className="control"><span>SEASON</span><select value={season} onChange={(event) => { setSeason(Number(event.target.value)); setPage(0); }}>{catalog.seasons.slice().sort((a, b) => b.season - a.season).map((entry) => <option key={entry.season} value={entry.season}>{entry.season - 1}–{String(entry.season).slice(-2)} · {fmt(entry.games.length, 0)} games</option>)}</select></label>
        <label className="control"><span>TEAM, MATCHUP OR GAME ID</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search source games" /></label>
      </div>
      {error && <p role="status" className="note">{error} Showing the embedded release snapshot.</p>}
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Matchup</th><th className="numeric">Events</th><th className="numeric">Scoring</th><th className="numeric">Shots</th><th>Source</th></tr></thead><tbody>{visible.map((game: PbpGame) => <tr key={(active?.season || "") + "-" + game.id}><td>{game.date ? date(game.date) : "—"}</td><td><strong>{game.away || "Away"} at {game.home || "Home"}</strong><small>ESPN game {game.id}</small></td><td className="numeric">{fmt(game.events, 0)}</td><td className="numeric">{fmt(game.scoring_plays, 0)}</td><td className="numeric">{fmt(game.shooting_plays, 0)}<small>{game.shot_attempts == null ? "Shot reconciliation unavailable" : `${fmt(game.shot_attempts, 0)} accepted shot attempts`}</small></td><td><a href={sourceUrl(game.id)} target="_blank" rel="noreferrer">Open ESPN ↗</a></td></tr>)}</tbody></table></div>
      {!visible.length && <p className="empty">No source games match this search.</p>}
      <div className="pagination"><span>{fmt(filtered.length, 0)} matching source games · page {page + 1} of {pages}</span><div><button className="button secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next →</button></div></div>
    </section>
  );
}
