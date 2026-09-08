"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { downloadCsv, toCsv } from "../../_lib/csv";

type Zone = { attempts: number; makes: number; points: number };
type Shooting = { attempts: number; makes: number; distance_sum: number; distance_count: number; zones: Record<string, Zone> };
type Row = { season: number; team_id: string; player_id: string; team_name: string | null; player_name: string | null; profile: Record<string, string>; recorded_games: number | null; recorded_minutes: number | null; recorded_points: number | null; recorded_rebounds: number | null; recorded_assists: number | null; shooting: Shooting | null };
type Result = { season: number; page: number; page_size: number; total: number; rows: Row[] };
type Meta = { seasons: number[]; classes: string[]; positions: string[]; total: number };
const label = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const fmt = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);
const pct = (zone: Zone | undefined) => zone && zone.attempts ? `${(100 * zone.makes / zone.attempts).toFixed(1)}%` : "—";

export default function NcaaRosters() {
  const initial = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const [season, setSeason] = useState(initial?.get("season") || "2026");
  const [query, setQuery] = useState(initial?.get("q") || "");
  const [classYear, setClassYear] = useState(initial?.get("classYear") || "");
  const [position, setPosition] = useState(initial?.get("position") || "");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(() => {
    const value = Number(initial?.get("page") || 0);
    return Number.isInteger(value) && value > 0 ? value : 0;
  });
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ season });
    if (query.trim()) params.set("q", query.trim());
    if (classYear) params.set("classYear", classYear);
    if (position) params.set("position", position);
    if (page) params.set("page", String(page));
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [season, query, classYear, position, page]);

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
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Roster link copied.");
    } catch {
      setCopied("Copy the roster URL from your address bar.");
    }
  };
  const download = () => {
    if (!result) return;
    downloadCsv(
      `ncaa-rosters-${season}-page-${page + 1}.csv`,
      toCsv(
        ["Season", "Player", "NCAA player ID", "Program", "NCAA team ID", "Class", "Position", "Height", "Hometown", "High school", "Roster GP", "Roster GS", "Recorded games", "Recorded minutes", "Recorded points", "Recorded rebounds", "Recorded assists", "Shot attempts", "Average distance", "Raw profile JSON", "Raw shooting JSON"],
        result.rows.map((row) => {
          const p = row.profile;
          const s = row.shooting;
          return [result.season, row.player_name, row.player_id, row.team_name, row.team_id, p.class, p.position, p.height, p.hometown, p.high_school, p.gp, p.gs, row.recorded_games, row.recorded_minutes, row.recorded_points, row.recorded_rebounds, row.recorded_assists, s?.attempts, s?.distance_count ? s.distance_sum / s.distance_count : null, JSON.stringify(p), s ? JSON.stringify(s) : null];
        }),
      ),
    );
  };
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
      <div className="section-heading" style={{ marginBottom: 20 }}><p>{result.total.toLocaleString()} matching roster rows · page {page + 1} of {pages} · class, school and hometown fields are retained exactly as supplied by the source. Shooting columns appear when a same-season NCAA shot profile exists.</p><div className="button-row"><button className="button secondary" type="button" onClick={download}>Download page CSV ↓</button><button className="button secondary" type="button" onClick={share}>Copy roster link</button></div></div>
      {copied && <p role="status">{copied}</p>}
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Player</th><th>Program</th><th>Class / position</th><th>Size</th><th>Hometown</th><th>High school</th><th className="numeric">Roster GP</th><th className="numeric">Roster GS</th><th className="numeric">Recorded PPG</th><th className="numeric">Recorded MPG</th><th className="numeric">Shot ATT</th><th className="numeric">3P%</th><th className="numeric">Rim%</th><th className="numeric">Avg dist.</th></tr></thead><tbody>{result.rows.map((row) => { const p = row.profile; const s = row.shooting; const z = s?.zones || {}; const three: Zone | undefined = s ? { attempts: (z.abovebreak3?.attempts || 0) + (z.corner3?.attempts || 0), makes: (z.abovebreak3?.makes || 0) + (z.corner3?.makes || 0), points: 0 } : undefined; return <tr key={`${row.team_id}-${row.player_id}`}><td><Link href={`/basketball/ncaa-player-box/?season=${row.season}&q=${encodeURIComponent(row.player_id)}`}>{row.player_name || row.player_id} →</Link><small>NCAA player {row.player_id}</small><small><a href={`https://stats.ncaa.org/players/${encodeURIComponent(row.player_id)}`} target="_blank" rel="noreferrer">NCAA source ↗</a></small></td><td><strong>{row.team_name || row.team_id}</strong><small>NCAA team {row.team_id}</small></td><td>{p.class || "—"}<small>{p.position || "Position unavailable"}</small></td><td>{p.height || "—"}<small>{p.ht_inches ? `${p.ht_inches} in` : ""}</small></td><td>{p.hometown || "—"}</td><td>{p.high_school || "—"}</td><td className="numeric">{p.gp || "—"}</td><td className="numeric">{p.gs || "—"}</td><td className="numeric">{fmt(row.recorded_games ? (row.recorded_points || 0) / row.recorded_games : null)}</td><td className="numeric">{fmt(row.recorded_minutes && row.recorded_games ? row.recorded_minutes / row.recorded_games : null)}</td><td className="numeric">{s?.attempts?.toLocaleString() || "—"}</td><td className="numeric">{pct(three)}</td><td className="numeric">{pct(z.rim)}</td><td className="numeric">{s?.distance_count ? `${(s.distance_sum / s.distance_count).toFixed(1)} ft` : "—"}</td></tr>; })}</tbody></table></div>
      {!result.rows.length && <p className="empty">No roster rows match this search.</p>}
      <div className="pagination"><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={(page + 1) * 40 >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div>
      <p className="note" style={{ marginTop: 24 }}>Source: NCAA-derived team roster release via SportsDataverse. A roster row is descriptive source context, not a verified recruiting commitment, transfer record, eligibility determination or ESPN identity match.</p>
    </>}
  </>;
}
