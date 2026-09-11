"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv, toCsv } from "../../_lib/csv";

type View = "rosters" | "officials";
type Row = Record<string, string | number | boolean | null | undefined> & { raw?: Record<string, unknown> };
type Source = { dataset?: string; url?: string | null; fetched_at?: string | null; sha256?: string | null } | null;
type Meta = { season: number; seasons: number[]; total: number; source: Source };
type Result = { season: number; page: number; page_size: number; total: number; rows: Row[] };

const seasonLabel = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const sourceDate = (value?: string | null) => value ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) : "date unavailable";
const asText = (value: unknown) => value == null || value === "" ? "—" : String(value);
const csvCell = (value: unknown): string | number | null | undefined => typeof value === "boolean" ? (value ? "true" : "false") : typeof value === "string" || typeof value === "number" ? value : value == null ? value : String(value);

export default function GameContext() {
  const initial = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const [view, setView] = useState<View>(initial?.get("view") === "officials" ? "officials" : "rosters");
  const [season, setSeason] = useState(initial?.get("season") || "2026");
  const [query, setQuery] = useState(initial?.get("q") || "");
  const [gameId, setGameId] = useState(initial?.get("gameId") || "");
  const [teamId, setTeamId] = useState(initial?.get("teamId") || "");
  const [page, setPage] = useState(() => Math.max(0, Number(initial?.get("page") || 0) || 0));
  const [meta, setMeta] = useState<Meta | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams({ view, season });
    if (query.trim()) params.set("q", query.trim());
    if (gameId.trim()) params.set("gameId", gameId.trim());
    if (teamId.trim() && view === "rosters") params.set("teamId", teamId.trim());
    if (page) params.set("page", String(page));
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [gameId, page, query, season, teamId, view]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/basketball/research/ncaa-game-context?view=${view}&season=${season}&meta=1`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The game context catalog could not be loaded."); return response.json() as Promise<Meta>; })
      .then((value) => { if (!controller.signal.aborted) setMeta(value); })
      .catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, [retry, season, view]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ view, season, page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    if (gameId.trim()) params.set("gameId", gameId.trim());
    if (teamId.trim() && view === "rosters") params.set("teamId", teamId.trim());
    setResult(null); setError("");
    fetch(`/api/basketball/research/ncaa-game-context?${params}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The game context archive could not be loaded."); return response.json() as Promise<Result>; })
      .then((value) => { if (!controller.signal.aborted) setResult(value); })
      .catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, [gameId, page, query, retry, season, teamId, view]);

  const pages = useMemo(() => Math.max(1, Math.ceil((result?.total || 0) / (result?.page_size || 100))), [result]);
  const reset = (fn: () => void) => { setPage(0); fn(); };
  const share = async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied("Archive link copied."); } catch { setCopied("Copy the archive URL from your address bar."); } };
  const headers = view === "rosters"
    ? ["Season", "Game ID", "Team ID", "Team", "Athlete ID", "Athlete", "Home/Away", "Jersey", "Position", "Starter", "Active", "DNP", "Ejected", "Reason", "Raw source JSON"]
    : ["Season", "Game ID", "Official order", "Official", "Position", "Position ID", "Raw source JSON"];
  const csvRows = result?.rows.map((row) => (view === "rosters"
    ? [result.season, row.game_id, row.team_id, row.team_name, row.athlete_id, row.athlete_name, row.home_away, row.jersey, row.position, row.starter, row.active, row.did_not_play, row.ejected, row.reason, JSON.stringify(row.raw || {})]
    : [result.season, row.game_id, row.official_order, row.official_name, row.official_position, row.official_position_id, JSON.stringify(row.raw || {})]).map(csvCell));
  const download = () => { if (result) downloadCsv(`ncaa-${view}-${season}-page-${page + 1}.csv`, toCsv(headers, csvRows || [])); };

  return <>
    <div className="page-title">
      <div className="eyebrow">ESPN source archive / game context</div>
      <h1>Know who<br /><em>actually played.</em></h1>
      <p>Search game-day roster and officiating releases for the context a box score cannot provide: who was active, who started, who sat, and which officials worked the game. Every row keeps its source payload for audit.</p>
    </div>
    <div className="strip">
      <div><strong>{result?.total.toLocaleString() ?? meta?.total.toLocaleString() ?? "—"}</strong><span>{view === "rosters" ? "Matching roster rows" : "Matching assignments"}</span></div>
      <div><strong>{meta?.seasons.length ?? "—"}</strong><span>Retained seasons</span></div>
      <div><strong>{seasonLabel(Number(season))}</strong><span>Selected edition</span></div>
      <div><strong>ESPN</strong><span>Via SportsDataverse</span></div>
    </div>
    <div className="button-row" style={{ marginTop: 24 }}>
      <button className={`button ${view === "rosters" ? "" : "secondary"}`} onClick={() => reset(() => { setView("rosters"); setTeamId(""); })}>Game rosters</button>
      <button className={`button ${view === "officials" ? "" : "secondary"}`} onClick={() => reset(() => setView("officials"))}>Officials</button>
      <button className="button secondary" type="button" onClick={share}>Copy archive link</button>
    </div>
    <div className="toolbar">
      <label className="control"><span>SEASON</span><select value={season} onChange={(event) => reset(() => setSeason(event.target.value))}>{(meta?.seasons || [2026, 2025]).map((value) => <option key={value} value={value}>{seasonLabel(value)}</option>)}</select></label>
      <label className="control"><span>{view === "rosters" ? "PLAYER, TEAM OR GAME" : "OFFICIAL OR GAME"}</span><input type="search" maxLength={120} placeholder={view === "rosters" ? "Search a player, team or game ID" : "Search an official or game ID"} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
      <label className="control"><span>GAME ID</span><input inputMode="numeric" maxLength={40} placeholder="Exact game ID" value={gameId} onChange={(event) => { setGameId(event.target.value); setPage(0); }} /></label>
      {view === "rosters" ? <label className="control"><span>TEAM ID</span><input inputMode="numeric" maxLength={40} placeholder="Exact team ID" value={teamId} onChange={(event) => { setTeamId(event.target.value); setPage(0); }} /></label> : null}
    </div>
    {meta?.source ? <details className="note" style={{ marginTop: 16 }}><summary>{view === "rosters" ? "Game roster" : "Officials"} source receipt for {seasonLabel(Number(season))}</summary><div className="table-scroll" style={{ marginTop: 12 }}><table className="data-table"><thead><tr><th>Retrieved (UTC)</th><th>SHA-256</th><th>Release</th></tr></thead><tbody><tr><td>{sourceDate(meta.source.fetched_at)}</td><td><code>{meta.source.sha256 || "—"}</code></td><td>{meta.source.url ? <a href={meta.source.url} target="_blank" rel="noreferrer">Open release ↗</a> : "—"}</td></tr></tbody></table></div><p style={{ marginTop: 12 }}>The receipt identifies the immutable SportsDataverse release used for this view. Raw publisher fields remain available in each row and CSV.</p></details> : null}
    {copied ? <p role="status" style={{ marginTop: 16 }}>{copied}</p> : null}
    {error ? <div className="status-error" role="alert"><span>{error}</span><button className="button secondary" type="button" onClick={() => { setError(""); setRetry((value) => value + 1); }}>Retry archive</button></div> : !result ? <p className="empty" role="status">Loading source rows…</p> : <section className="note" style={{ marginTop: 24 }}>
      <div className="section-heading"><div><div className="eyebrow">{seasonLabel(result.season)} retained rows</div><h2>{result.total.toLocaleString()} matching records</h2></div><button className="button secondary" type="button" onClick={download}>Download page CSV ↓</button></div>
      <div className="table-scroll" style={{ marginTop: 16 }}><table className="data-table"><thead><tr>{view === "rosters" ? <><th>Game</th><th>Program</th><th>Player</th><th>Home/away</th><th>Role</th><th>Status</th><th>Position</th></> : <><th>Game</th><th>Order</th><th>Official</th><th>Position</th></>}</tr></thead><tbody>{result.rows.map((row, index) => <tr key={`${row.game_id}-${row.athlete_id ?? row.official_order}-${index}`}>
        {view === "rosters" ? <><td><code>{asText(row.game_id)}</code></td><td><strong>{asText(row.team_name)}</strong><small>Team {asText(row.team_id)}</small></td><td><strong>{asText(row.athlete_name)}</strong><small>Athlete {asText(row.athlete_id)}</small></td><td>{asText(row.home_away)}</td><td>{row.starter ? "Starter" : "Bench"}</td><td>{row.did_not_play ? asText(row.reason || "DNP") : row.active ? "Active" : row.ejected ? "Ejected" : "Inactive"}</td><td>{asText(row.position)}</td></> : <><td><code>{asText(row.game_id)}</code></td><td>{asText(row.official_order)}</td><td><strong>{asText(row.official_name)}</strong><small>Official position ID {asText(row.official_position_id)}</small></td><td>{asText(row.official_position)}</td></>}
      </tr>)}</tbody></table></div>
      {!result.rows.length ? <p className="empty">No source rows match these filters.</p> : null}
      <div className="pagination"><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={(page + 1) * result.page_size >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div>
      <p className="note" style={{ marginTop: 24 }}>Source release retrieved {sourceDate(meta?.source?.fetched_at)}. These rows describe the published game context; they do not establish eligibility, a recruiting commitment, or a future availability decision.</p>
    </section>}
  </>;
}
