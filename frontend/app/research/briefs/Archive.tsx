"use client";
import { useEffect, useState } from "react";
import { date } from "../../_lib/format";
type Row = {
  revision: string;
  sport: string;
  game_id: string;
  season: number;
  home_name: string;
  away_name: string;
  starts_at: string;
  time_tbd: number;
  model_id: string;
  forecast_generated_at: string;
  first_recorded_at: string;
  original_path: string;
};
type Data = { rows: Row[]; total: number; page: number; asof: number };
const clock = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " UTC";
export default function Archive() {
  const [sport, setSport] = useState("all"),
    [q, setQ] = useState(""),
    [game, setGame] = useState(""),
    [view, setView] = useState("latest"),
    [page, setPage] = useState(0),
    [asof, setAsof] = useState<number | undefined>(),
    [ready, setReady] = useState(false),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (["football", "basketball"].includes(p.get("sport") || ""))
      setSport(p.get("sport")!);
    setQ((p.get("q") || "").slice(0, 80));
    if (/^\d{1,15}$/.test(p.get("game") || "")) {
      setGame(p.get("game")!);
      setView("versions");
    } else if (p.get("view") === "versions") setView("versions");
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const c = new AbortController();
    setData(null);
    setError("");
    const params = new URLSearchParams({ sport, q, view, page: String(page) });
    if (game) params.set("game", game);
    if (asof !== undefined) params.set("asof", String(asof));
    fetch("/api/research/briefs?" + params, { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw Error("The archive could not be loaded. Try again.");
        return r.json();
      })
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [ready, sport, q, game, view, page, asof, retry]);
  function filters(s: string, text: string, g: string, v: string) {
    setSport(s);
    setQ(text);
    setGame(g);
    setView(v);
    setPage(0);
    setAsof(undefined);
    const p = new URLSearchParams({ sport: s, view: v });
    if (text) p.set("q", text);
    if (g) p.set("game", g);
    history.replaceState(null, "", "?" + p);
  }
  return (
    <>
      <div className="paper-panel brief-archive-note">
        <strong>A snapshot, not a current game report.</strong>
        <p>
          Capture time is when this archive first stored the reading view. It is
          separate from forecast generation and does not prove the forecast was
          published before kickoff. App controls and private browser notes are
          excluded; archived pages retain the default statistical view. Follow
          the game-history link for later source observations.
        </p>
      </div>
      <div className="toolbar">
        <label className="control">
          <span>SPORT</span>
          <select
            value={sport}
            onChange={(e) => filters(e.target.value, q, "", view)}
          >
            <option value="all">Basketball and football</option>
            <option value="basketball">Basketball</option>
            <option value="football">Football</option>
          </select>
        </label>
        <label className="control">
          <span>TEAM SEARCH</span>
          <input
            type="search"
            value={q}
            maxLength={80}
            placeholder="Try Michigan or Alabama"
            onChange={(e) => filters(sport, e.target.value, game, view)}
          />
        </label>
        <label className="control">
          <span>VERSIONS</span>
          <select
            value={view}
            onChange={(e) => filters(sport, q, game, e.target.value)}
          >
            <option value="latest">Latest captured view per game</option>
            <option value="versions">Every captured version</option>
          </select>
        </label>
      </div>
      {game && (
        <p className="note">
          Showing retained views for game {game}.{" "}
          <button
            className="button secondary"
            onClick={() => filters(sport, "", "", "latest")}
          >
            Browse all games
          </button>
        </p>
      )}
      {error ? (
        <div className="status-error" role="alert">
          {error}{" "}
          <button
            className="button secondary"
            onClick={() => setRetry(retry + 1)}
          >
            Retry archive
          </button>
        </div>
      ) : !data ? (
        <p className="empty" role="status">
          Loading retained matchup briefs…
        </p>
      ) : (
        <>
          <p className="note brief-archive-count" role="status">
            {data.total.toLocaleString()}{" "}
            {view === "latest"
              ? "games with retained briefs"
              : "captured versions"}{" "}
            · Ordered by scheduled date in each snapshot
          </p>
          <div className="article-grid brief-archive-grid">
            {data.rows.map((r) => (
              <article className="article-card" key={r.revision}>
                <div className="eyebrow">
                  {r.sport} / {r.season}
                </div>
                <h2>
                  {r.away_name} <span className="brief-versus">vs</span>{" "}
                  {r.home_name}
                </h2>
                <p>
                  Scheduled {date(r.starts_at)}
                  {r.time_tbd ? " · Start time unconfirmed" : ""}
                </p>
                <dl>
                  <div>
                    <dt>First archived</dt>
                    <dd>{clock(r.first_recorded_at)}</dd>
                  </div>
                  <div>
                    <dt>Forecast generated</dt>
                    <dd>{clock(r.forecast_generated_at)}</dd>
                  </div>
                </dl>
                <a
                  href={`/archive/briefs/${r.sport}/${r.game_id}/${r.revision}`}
                >
                  Read the frozen snapshot →
                </a>
                <div className="brief-archive-links">
                  <a href={`?sport=${r.sport}&game=${r.game_id}&view=versions`}>
                    All versions
                  </a>
                  <a href={`/research/game/?sport=${r.sport}&id=${r.game_id}`}>
                    Game history
                  </a>
                  <a href={r.original_path}>Current brief URL</a>
                </div>
                <details>
                  <summary>Model and snapshot identity</summary>
                  <p>
                    <code>{r.model_id}</code>
                  </p>
                  <p>
                    <code>{r.revision}</code>
                  </p>
                </details>
              </article>
            ))}
          </div>
          {!data.rows.length && (
            <p className="empty">
              No retained briefs match these filters. This does not establish
              that a game was never analyzed.
            </p>
          )}
          <div className="pagination">
            <span>
              Page {page + 1} of {Math.max(1, Math.ceil(data.total / 24))}
            </span>
            <div>
              <button
                className="button secondary"
                disabled={!page}
                onClick={() => {
                  setAsof(data.asof);
                  setPage(page - 1);
                }}
              >
                ← Previous
              </button>
              <button
                className="button secondary"
                disabled={(page + 1) * 24 >= data.total}
                onClick={() => {
                  setAsof(data.asof);
                  setPage(page + 1);
                }}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
