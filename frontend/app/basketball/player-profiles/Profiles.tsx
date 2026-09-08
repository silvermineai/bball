"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { downloadCsv, toCsv } from "../../_lib/csv";

type Row = {
  id: string;
  name: string | null;
  position: string | null;
  height: string | null;
  weight: string | null;
  jersey: string | null;
  experience: string | null;
  status: string | null;
  team_id: string | null;
  profile: Record<string, string>;
};
type Result = { season: number; page: number; page_size: number; total: number; rows: Row[] };
type Meta = { seasons: number[]; positions: string[]; statuses: string[]; total: number };

const label = (season: number) => `${season - 1}–${String(season).slice(-2)}`;

export default function Profiles() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [season, setSeason] = useState("2026");
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/basketball/research/player-core?meta=1&season=${season}`)
      .then((r) => { if (!r.ok) throw Error("The source profile catalog could not be loaded."); return r.json() as Promise<Meta>; })
      .then(setMeta)
      .catch((e) => setError(e.message));
  }, [season]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ season, page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    if (position) params.set("position", position);
    if (status) params.set("status", status);
    setResult(null);
    fetch(`/api/basketball/research/player-core?${params}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw Error("The source profiles could not be loaded. Please reload."); return r.json() as Promise<Result>; })
      .then((value) => { if (!controller.signal.aborted) setResult(value); })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [season, query, position, status, page]);

  const reset = (fn: () => void) => { setPage(0); fn(); };
  const pages = useMemo(() => Math.max(1, Math.ceil((result?.total || 0) / 40)), [result]);
  const exportRows = result?.rows || [];
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Source archive / player identity</div>
        <h1>Know the<br /><em>player file.</em></h1>
        <p>Browse the publisher&apos;s historical identity records before you evaluate production, roster movement or a matchup. These fields orient the source archive; they do not prove eligibility or a current roster place.</p>
      </div>
      <div className="strip">
        <div><strong>{result?.total.toLocaleString() ?? meta?.total.toLocaleString() ?? "—"}</strong><span>Profiles in selected season</span></div>
        <div><strong>{meta?.positions.length ?? "—"}</strong><span>Position labels</span></div>
        <div><strong>{meta?.statuses.length ?? "—"}</strong><span>Status labels</span></div>
        <div><strong>{meta?.seasons.length ?? "—"}</strong><span>Source seasons</span></div>
      </div>
      <div className="toolbar">
        <label className="control"><span>SEASON</span><select value={season} onChange={(e) => reset(() => { setSeason(e.target.value); setPosition(""); setStatus(""); })}>{(meta?.seasons || [2026]).map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
        <label className="control"><span>PLAYER OR ID</span><input type="search" maxLength={120} placeholder="Search a player or source ID" value={query} onChange={(e) => reset(() => setQuery(e.target.value))} /></label>
        <label className="control"><span>POSITION</span><select value={position} onChange={(e) => reset(() => setPosition(e.target.value))}><option value="">All positions</option>{(meta?.positions || []).map((v) => <option key={v}>{v}</option>)}</select></label>
        <label className="control"><span>STATUS</span><select value={status} onChange={(e) => reset(() => setStatus(e.target.value))}><option value="">All statuses</option>{(meta?.statuses || []).map((v) => <option key={v}>{v}</option>)}</select></label>
      </div>
      {error ? <p className="status-error" role="alert">{error}</p> : !result ? <p className="empty" role="status">Loading source profiles…</p> : <>
        <div className="section-heading" style={{ marginTop: 20 }}><p>{result.total.toLocaleString()} matching profiles · page {page + 1} of {pages}</p><button className="button secondary" type="button" disabled={!exportRows.length} onClick={() => downloadCsv(`basketball-player-profiles-${season}.csv`, toCsv(["Season", "Player", "Source ID", "Position", "Height", "Weight", "Jersey", "Experience", "Status", "Team ID"], exportRows.map((r) => [label(result.season), r.name, r.id, r.position, r.height, r.weight, r.jersey, r.experience, r.status, r.team_id])))}>Download CSV ↓</button></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Player</th><th>Position</th><th>Size</th><th>Jersey</th><th>Experience</th><th>Status</th><th>Source ID</th></tr></thead><tbody>{result.rows.map((r) => <tr key={r.id}><td><Link href={`/basketball/player/?id=${encodeURIComponent(r.id)}&season=${season}`}>{r.name || r.id} →</Link><small>{r.team_id ? `Team source ID ${r.team_id}` : "Team unavailable"}</small></td><td>{r.position || "—"}</td><td>{[r.height, r.weight].filter(Boolean).join(" · ") || "—"}</td><td className="numeric">{r.jersey || "—"}</td><td className="numeric">{r.experience || "—"}</td><td>{r.status || "—"}</td><td><small>{r.id}</small></td></tr>)}</tbody></table></div>
        {!result.rows.length && <p className="empty">No source profiles match these filters.</p>}
        <div className="pagination"><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={(page + 1) * 40 >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div>
        <p className="note" style={{ marginTop: 24 }}>Source: ESPN-derived player-core release via SportsDataverse. Personal birth-date, age and birth-location fields are omitted. A source profile is not a verified roster, eligibility or transfer record.</p>
      </>}
    </>
  );
}
