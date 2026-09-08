"use client";

import { useEffect, useMemo, useState } from "react";

type Row = { season: number; team_id: string; player_id: string; team_name: string | null; player_name: string | null; profile: Record<string, string> };
type Result = { season: number; page: number; page_size: number; total: number; rows: Row[] };
type Meta = { seasons: number[]; classes: string[]; positions: string[]; total: number };
const label = (season: number) => `${season - 1}–${String(season).slice(-2)}`;

export default function NcaaRosters() {
  const [season, setSeason] = useState("2026");
  const [query, setQuery] = useState("");
  const [classYear, setClassYear] = useState("");
  const [position, setPosition] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/basketball/research/ncaa-rosters?meta=1&season=${season}`)
      .then((r) => { if (!r.ok) throw Error("The NCAA roster catalog could not be loaded."); return r.json() as Promise<Meta>; })
      .then(setMeta).catch((e) => setError(e.message));
  }, [season]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ season, page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    if (classYear) params.set("classYear", classYear);
    if (position) params.set("position", position);
    setResult(null);
    fetch(`/api/basketball/research/ncaa-rosters?${params}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw Error("The NCAA roster archive could not be loaded."); return r.json() as Promise<Result>; })
      .then((value) => { if (!controller.signal.aborted) setResult(value); })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [season, query, classYear, position, page]);

  const pages = useMemo(() => Math.max(1, Math.ceil((result?.total || 0) / 40)), [result]);
  const reset = (fn: () => void) => { setPage(0); fn(); };
  return <>
    <div className="page-title">
      <div className="eyebrow">NCAA source archive / roster and recruiting context</div>
      <h1>Know the<br /><em>roster story.</em></h1>
      <p>Search the attributed NCAA roster release for class year, position, size, hometown and high school. These are source records that help frame recruiting research; they do not establish eligibility, commitment or transfer status.</p>
    </div>
    <div className="strip">
      <div><strong>{result?.total.toLocaleString() ?? meta?.total.toLocaleString() ?? "—"}</strong><span>Roster rows in view</span></div>
      <div><strong>{meta?.classes.length ?? "—"}</strong><span>Class labels</span></div>
      <div><strong>{meta?.positions.length ?? "—"}</strong><span>Position labels</span></div>
      <div><strong>NCAA</strong><span>Identity namespace</span></div>
    </div>
    <div className="toolbar">
      <label className="control"><span>SEASON</span><select value={season} onChange={(e) => reset(() => { setSeason(e.target.value); setClassYear(""); setPosition(""); })}>{(meta?.seasons || [2026]).map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
      <label className="control"><span>PLAYER, SCHOOL OR HOMETOWN</span><input type="search" maxLength={120} placeholder="Search names, programs or high schools" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
      <label className="control"><span>CLASS</span><select value={classYear} onChange={(e) => reset(() => setClassYear(e.target.value))}><option value="">All classes</option>{(meta?.classes || []).map((v) => <option key={v}>{v}</option>)}</select></label>
      <label className="control"><span>POSITION</span><select value={position} onChange={(e) => reset(() => setPosition(e.target.value))}><option value="">All positions</option>{(meta?.positions || []).map((v) => <option key={v}>{v}</option>)}</select></label>
    </div>
    {error ? <p className="status-error" role="alert">{error}</p> : !result ? <p className="empty" role="status">Loading NCAA roster rows…</p> : <>
      <p className="note">{result.total.toLocaleString()} matching roster rows · page {page + 1} of {pages} · class, school and hometown fields are retained exactly as supplied by the source.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Player</th><th>Program</th><th>Class / position</th><th>Size</th><th>Hometown</th><th>High school</th><th className="numeric">GP</th><th className="numeric">GS</th></tr></thead><tbody>{result.rows.map((row) => { const p = row.profile; return <tr key={`${row.team_id}-${row.player_id}`}><td><strong>{row.player_name || row.player_id}</strong><small>NCAA player {row.player_id}</small></td><td><strong>{row.team_name || row.team_id}</strong><small>NCAA team {row.team_id}</small></td><td>{p.class || "—"}<small>{p.position || "Position unavailable"}</small></td><td>{p.height || "—"}<small>{p.ht_inches ? `${p.ht_inches} in` : ""}</small></td><td>{p.hometown || "—"}</td><td>{p.high_school || "—"}</td><td className="numeric">{p.gp || "—"}</td><td className="numeric">{p.gs || "—"}</td></tr>; })}</tbody></table></div>
      {!result.rows.length && <p className="empty">No roster rows match this search.</p>}
      <div className="pagination"><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={(page + 1) * 40 >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div>
      <p className="note" style={{ marginTop: 24 }}>Source: NCAA-derived team roster release via SportsDataverse. A roster row is descriptive source context, not a verified recruiting commitment, transfer record, eligibility determination or ESPN identity match.</p>
    </>}
  </>;
}
