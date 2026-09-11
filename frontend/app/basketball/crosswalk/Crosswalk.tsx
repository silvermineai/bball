"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { downloadCsv, toCsv } from "../../_lib/csv";

type Meta = {
  season: number;
  seasons: number[];
  rows: number;
  players: number;
  fox_ids: number;
  yahoo_ids: number;
  source: { url: string | null; fetched_at: string | null; sha256: string | null };
  identity_note: string;
};

type Row = {
  season: number;
  espn_team_id: string;
  team_abbreviation: string | null;
  player_name: string | null;
  espn_athlete_id: string;
  espn_full_name: string | null;
  espn_jersey: string | null;
  espn_position: string | null;
  fox_athlete_id: string | null;
  fox_player: string | null;
  fox_jersey: string | null;
  fox_position_group: string | null;
  yahoo_player_id: string | null;
  yahoo_player_name: string | null;
  match_method: string;
  match_confidence: number | null;
  match_keys: string | null;
};

type Result = { page: number; page_size: number; total: number; rows: Row[] };

const providerLabels = { all: "All providers", fox: "Fox Sports IDs", yahoo: "Yahoo IDs" } as const;
type Provider = keyof typeof providerLabels;

export default function Crosswalk() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<Provider>("all");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get("q") || "");
    const requested = params.get("provider") as Provider | null;
    if (requested && requested in providerLabels) setProvider(requested);
    const requestedPage = Number(params.get("page") || 0);
    if (Number.isInteger(requestedPage) && requestedPage >= 0) setPage(Math.min(requestedPage, 1000));
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("q", query.trim()); else url.searchParams.delete("q");
    if (provider !== "all") url.searchParams.set("provider", provider); else url.searchParams.delete("provider");
    if (page) url.searchParams.set("page", String(page)); else url.searchParams.delete("page");
    window.history.replaceState(window.history.state, "", url);
  }, [page, provider, query]);

  const retryArchive = () => { setError(""); setRetryNonce((value) => value + 1); };

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/player-crosswalk?meta=1", { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The player crosswalk metadata is unavailable."); return response.json() as Promise<Meta>; })
      .then(setMeta)
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "The player crosswalk metadata is unavailable."); });
    return () => controller.abort();
  }, [retryNonce]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ provider, page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    setResult(null);
    fetch(`/api/basketball/research/player-crosswalk?${params}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The player crosswalk could not be loaded."); return response.json() as Promise<Result>; })
      .then((payload) => { if (!controller.signal.aborted) setResult(payload); })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "The player crosswalk could not be loaded."); });
    return () => controller.abort();
  }, [page, provider, query, retryNonce]);

  const pages = Math.max(1, Math.ceil((result?.total || 0) / (result?.page_size || 40)));
  const exportPage = () => {
    if (!result) return;
    downloadCsv("basketball-player-crosswalk.csv", toCsv(
      ["Season", "Team", "Player", "ESPN athlete ID", "Fox athlete ID", "Yahoo player ID", "Match method", "Match confidence", "ESPN position", "Fox position group"],
      result.rows.map((row) => [row.season, row.team_abbreviation, row.player_name || row.espn_full_name, row.espn_athlete_id, row.fox_athlete_id, row.yahoo_player_id, row.match_method, row.match_confidence, row.espn_position, row.fox_position_group]),
    ));
  };

  return (
    <section className="section">
      <div className="strip">
        <div><strong>{meta?.players.toLocaleString() || "—"}</strong><span>ESPN source players</span></div>
        <div><strong>{meta?.rows.toLocaleString() || "—"}</strong><span>Crosswalk rows</span></div>
        <div><strong>{meta?.fox_ids.toLocaleString() || "—"}</strong><span>Fox IDs present</span></div>
        <div><strong>{meta?.yahoo_ids.toLocaleString() || "—"}</strong><span>Yahoo IDs present</span></div>
      </div>
      <p className="note">This release makes provider identifiers searchable beside the exact ESPN player file. Match method and confidence are retained from the publisher. {meta?.identity_note || "No NCAA ID join is asserted."}</p>
      <div className="toolbar">
        <label className="control"><span>PLAYER, TEAM OR ID</span><input type="search" maxLength={120} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search a player, program or identifier" /></label>
        <label className="control"><span>PROVIDER COVERAGE</span><select value={provider} onChange={(event) => { setProvider(event.target.value as Provider); setPage(0); }}>{Object.entries(providerLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button className="button secondary" type="button" onClick={exportPage} disabled={!result?.rows.length}>Download page CSV ↓</button>
      </div>
      {error ? <div className="status-error" role="alert"><span>{error}</span><button className="button secondary" type="button" onClick={retryArchive}>Retry crosswalk archive</button></div> : !result ? <p className="empty" role="status">Loading identifier evidence…</p> : <>
        <p className="note" role="status">{result.total.toLocaleString()} matching rows · page {page + 1} of {pages}</p>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Player / program</th><th>ESPN source ID</th><th>Fox Sports ID</th><th>Yahoo ID</th><th>Publisher match</th></tr></thead>
            <tbody>{result.rows.map((row) => <tr key={`${row.season}-${row.espn_team_id}-${row.espn_athlete_id}`}>
              <td><strong>{row.espn_full_name || row.player_name || "Unnamed source row"}</strong><small>{row.team_abbreviation || "Team unavailable"}{row.espn_position ? ` · ${row.espn_position}` : ""}</small></td>
              <td><Link href={`/basketball/player/?id=${encodeURIComponent(row.espn_athlete_id)}&season=${row.season}`}>{row.espn_athlete_id} →</Link></td>
              <td>{row.fox_athlete_id || "—"}{row.fox_player && row.fox_player !== row.espn_full_name ? <small>{row.fox_player}</small> : null}</td>
              <td>{row.yahoo_player_id || "—"}{row.yahoo_player_name ? <small>{row.yahoo_player_name}</small> : null}</td>
              <td><strong>{row.match_confidence == null ? "—" : `${(row.match_confidence * 100).toFixed(0)}%`}</strong><small>{row.match_method.replaceAll("_", " ")}</small></td>
            </tr>)}</tbody>
          </table>
        </div>
        {!result.rows.length && <p className="empty">No crosswalk rows match this search.</p>}
        <div className="pagination"><button className="button secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>Next →</button></div>
      </>}
      {meta?.source.url && <details className="note" style={{ marginTop: 24 }}><summary>Source receipt</summary><p style={{ marginTop: 12 }}>Retrieved {meta.source.fetched_at ? new Date(meta.source.fetched_at).toLocaleString("en-US", { timeZone: "UTC" }) : "date unavailable"} · SHA-256 <code>{meta.source.sha256 || "unavailable"}</code></p><a href={meta.source.url} target="_blank" rel="noreferrer">Open SportsDataverse release ↗</a></details>}
      <p className="note" style={{ marginTop: 24 }}>Fox and Yahoo identifiers are shown as source evidence and are not used to merge NCAA records. A provider match does not establish eligibility, transfer status, roster availability or a unique person outside the source&apos;s own match.</p>
    </section>
  );
}
