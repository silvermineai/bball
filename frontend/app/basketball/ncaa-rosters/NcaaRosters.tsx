"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { fetchWithTransientRetry } from "../../_lib/live-basketball-forecasts";
import { safeSum } from "../../_lib/ncaa-player-box";

type Zone = { attempts: number; makes: number; points: number };
type Shooting = { attempts: number; makes: number; distance_sum: number; distance_count: number; zones: Record<string, Zone> };
type Row = { season: number; team_id: string; player_id: string; team_name: string | null; player_name: string | null; profile: Record<string, string>; recorded_games: number | null; recorded_minutes: number | null; recorded_points: number | null; recorded_rebounds: number | null; recorded_assists: number | null; shooting: Shooting | null };
export type NcaaRosterResult = { season: number; page: number; page_size: number; total: number; rows: Row[] };
type Result = NcaaRosterResult;
type Meta = { seasons: number[]; classes: string[]; positions: string[]; total: number; source?: { url: string | null; fetched_at: string | null; sha256: string | null } };
type Transition = { team_id: string; team_name: string; previous_players: number; current_players: number; overlap_players: number; new_players: number; departed_players: number; continuity_rate: number | null };
type TransitionResult = { from_season: number; to_season: number; page: number; page_size: number; total: number; rows: Transition[] };
const label = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const fmt = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);
const pct = (zone: Zone | undefined) => zone && zone.attempts ? `${(100 * zone.makes / zone.attempts).toFixed(1)}%` : "—";
const sourceDate = (value: string | null) => value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "date unavailable";

export function validateNcaaRosterExportPage(
  payload: NcaaRosterResult,
  expectedSeason: number,
  expectedTotal: number,
  expectedPageSize: number,
  page: number,
  totalPages: number,
) {
  if (
    Number(payload.season) !== expectedSeason
    || Number(payload.page) !== page
    || !Number.isInteger(Number(payload.total))
    || Number(payload.total) !== expectedTotal
    || !Number.isInteger(Number(payload.page_size))
    || Number(payload.page_size) !== expectedPageSize
    || !Array.isArray(payload.rows)
    || payload.rows.length > expectedPageSize
  ) {
    throw new Error("The roster release changed during export.");
  }
  if (page < totalPages - 1 && payload.rows.length === 0) {
    throw new Error("The roster release returned an incomplete page.");
  }
  return payload.rows;
}

export default function NcaaRosters() {
  const initial = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const [season, setSeason] = useState(initial?.get("season") || "2026");
  const [query, setQuery] = useState(initial?.get("q") || "");
  const [classYear, setClassYear] = useState(initial?.get("classYear") || "");
  const [position, setPosition] = useState(initial?.get("position") || "");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [transitions, setTransitions] = useState<TransitionResult | null>(null);
  const [page, setPage] = useState(() => {
    const value = Number(initial?.get("page") || 0);
    return Number.isInteger(value) && value > 0 ? value : 0;
  });
  const [error, setError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [copied, setCopied] = useState(""), [exporting, setExporting] = useState(false), [exportMessage, setExportMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ season });
    if (query.trim()) params.set("q", query.trim());
    if (classYear) params.set("classYear", classYear);
    if (position) params.set("position", position);
    if (page) params.set("page", String(page));
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [season, query, classYear, position, page]);

  useEffect(() => {
    const toSeason = Number(season);
    if (!Number.isInteger(toSeason) || toSeason <= 2010) {
      setTransitions(null);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ fromSeason: String(toSeason - 1), toSeason: String(toSeason) });
    fetch(`/api/basketball/research/ncaa-rosters/transitions?${params}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw Error("The continuity view could not be loaded."); return r.json() as Promise<TransitionResult>; })
      .then((value) => { if (!controller.signal.aborted) setTransitions(value); })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [retryNonce, season]);

  useEffect(() => {
    fetch(`/api/basketball/research/ncaa-rosters?meta=1&season=${season}`)
      .then((r) => { if (!r.ok) throw Error("The roster catalog could not be loaded."); return r.json() as Promise<Meta>; })
      .then(setMeta).catch((e) => setError(e.message));
  }, [retryNonce, season]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ season, page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    if (classYear) params.set("classYear", classYear);
    if (position) params.set("position", position);
    setResult(null);
    fetch(`/api/basketball/research/ncaa-rosters?${params}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw Error("The College basketball roster archive could not be loaded."); return r.json() as Promise<Result>; })
      .then((value) => { if (!controller.signal.aborted) setResult(value); })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [classYear, page, position, query, retryNonce, season]);

  const pages = useMemo(() => Math.max(1, Math.ceil((result?.total || 0) / 40)), [result]);
  const reset = (fn: () => void) => { setPage(0); fn(); };
  const retryLiveArchive = () => { setError(""); setRetryNonce((value) => value + 1); };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Roster link copied.");
    } catch {
      setCopied("Copy the roster URL from your address bar.");
    }
  };
  const exportHeaders = ["Season", "Player", "Archive player ID", "Program", "Archive team ID", "Class", "Position", "Height", "Hometown", "High school", "Roster GP", "Roster GS", "Recorded games", "Recorded minutes", "Recorded points", "Recorded rebounds", "Recorded assists", "Shot attempts", "Average distance", "Raw profile JSON", "Raw shooting JSON", "Edition retrieved (UTC)", "Edition SHA-256"];
  const exportRow = (row: Row, activeSeason: number) => {
    const p = row.profile;
    const s = row.shooting;
    return [activeSeason, row.player_name, row.player_id, row.team_name, row.team_id, p.class, p.position, p.height, p.hometown, p.high_school, p.gp, p.gs, row.recorded_games, row.recorded_minutes, row.recorded_points, row.recorded_rebounds, row.recorded_assists, s?.attempts, s?.distance_count ? s.distance_sum / s.distance_count : null, JSON.stringify(p), s ? JSON.stringify(s) : null, meta?.source?.fetched_at, meta?.source?.sha256];
  };
  const download = () => {
    if (!result) return;
    downloadCsv(`ncaa-rosters-${season}-page-${page + 1}.csv`, toCsv(exportHeaders, result.rows.map((row) => exportRow(row, result.season))));
  };
  const downloadAll = async () => {
    if (!result || exporting) return;
    const totalPages = Math.max(1, Math.ceil(result.total / result.page_size));
    if (totalPages > 1001) {
      setExportMessage("This cohort exceeds the bounded export window. Add a player, school, class or position filter first, or use the exact source parquet.");
      return;
    }
    setExporting(true);
    setExportMessage(`Preparing 0 of ${result.total.toLocaleString()} rows…`);
    try {
      const rows: Row[] = [];
      const cohort = `roster-export-${Date.now()}`;
      for (let requestedPage = 0; requestedPage < totalPages; requestedPage += 1) {
        const params = new URLSearchParams({ season, page: String(requestedPage) });
        params.set("cohort", cohort);
        if (query.trim()) params.set("q", query.trim());
        if (classYear) params.set("classYear", classYear);
        if (position) params.set("position", position);
        const response = await fetchWithTransientRetry(`/api/basketball/research/ncaa-rosters?${params.toString()}`);
        if (!response.ok) throw new Error("The complete roster export could not be loaded.");
        const payload = await response.json() as Result;
        rows.push(...validateNcaaRosterExportPage(payload, Number(season), result.total, result.page_size, requestedPage, totalPages));
        setExportMessage(`Preparing ${rows.length.toLocaleString()} of ${result.total.toLocaleString()} rows…`);
      }
      if (rows.length !== result.total) throw new Error("The roster release returned an incomplete export.");
      const identities = new Set(rows.map((row) => `${row.season}:${row.team_id}:${row.player_id}`));
      if (identities.size !== rows.length) throw new Error("The roster release returned duplicate player rows.");
      downloadCsv(`ncaa-rosters-${season}-all.csv`, toCsv(exportHeaders, rows.map((row) => exportRow(row, result.season))));
      setExportMessage(`Downloaded ${rows.length.toLocaleString()} roster rows.`);
    } catch (reason) {
      setExportMessage(reason instanceof Error ? reason.message : "The complete roster export could not be loaded.");
    } finally {
      setExporting(false);
    }
  };
  return <>
    <div className="page-title">
      <div className="eyebrow">Roster archive / recruiting context</div>
      <h1>Know the<br /><em>roster story.</em></h1>
      <p>Search the roster archive for class year, position, size, hometown and high school. These are source records that help frame recruiting research; they do not establish eligibility, commitment or transfer status. Roster IDs are kept within their source season and are not treated as a cross-season person key.</p>
    </div>
    <div className="strip">
      <div><strong>{result?.total.toLocaleString() ?? meta?.total.toLocaleString() ?? "—"}</strong><span>Roster rows in view</span></div>
      <div><strong>{meta?.classes.length ?? "—"}</strong><span>Class labels</span></div>
      <div><strong>{meta?.positions.length ?? "—"}</strong><span>Position labels</span></div>
      <div><strong>IDs</strong><span>Identity namespace</span></div>
    </div>
    <div className="toolbar">
      <label className="control"><span>SEASON</span><select value={season} onChange={(e) => reset(() => { setSeason(e.target.value); setClassYear(""); setPosition(""); })}>{(meta?.seasons || [2026]).map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
      <label className="control"><span>PLAYER, SCHOOL OR HOMETOWN</span><input type="search" maxLength={120} placeholder="Search names, programs or high schools" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
      <label className="control"><span>CLASS</span><select value={classYear} onChange={(e) => reset(() => setClassYear(e.target.value))}><option value="">All classes</option>{(meta?.classes || []).map((v) => <option key={v}>{v}</option>)}</select></label>
      <label className="control"><span>POSITION</span><select value={position} onChange={(e) => reset(() => setPosition(e.target.value))}><option value="">All positions</option>{(meta?.positions || []).map((v) => <option key={v}>{v}</option>)}</select></label>
    </div>
    {meta?.source ? <details className="note" style={{ marginTop: 16 }}><summary>Roster edition receipt for {label(Number(season))}</summary><div className="table-scroll" style={{ marginTop: 12 }}><table className="data-table"><thead><tr><th>Retrieved (UTC)</th><th>SHA-256</th><th>Status</th></tr></thead><tbody><tr><td>{sourceDate(meta.source.fetched_at)}</td><td><code>{meta.source.sha256 || "—"}</code></td><td>Retained</td></tr></tbody></table></div><p style={{ marginTop: 12 }}>This clock describes the retained edition, not a live roster, eligibility or transfer update. CSV exports carry the same receipt fields.</p></details> : null}
    {transitions ? <section className="note" style={{ marginTop: 24 }}><div className="section-heading" style={{ marginBottom: 12 }}><div><div className="eyebrow">Program planning lens</div><h2>Roster continuity across editions</h2></div><span>{transitions.total.toLocaleString()} programs</span></div><p>Compare the {label(transitions.from_season)} and {label(transitions.to_season)} derived editions by program. “Overlap” means the same archive player ID appears for the same team in both editions; it is a research signal, not a transfer, person-match or eligibility ruling.</p><div className="table-scroll"><table className="data-table"><thead><tr><th>Program</th><th className="numeric">Prior</th><th className="numeric">Current</th><th className="numeric">Overlap</th><th className="numeric">Continuity</th><th className="numeric">New IDs</th><th className="numeric">Departed IDs</th></tr></thead><tbody>{transitions.rows.map((row) => <tr key={row.team_id}><td><strong>{row.team_name}</strong><small>Team ID {row.team_id}</small></td><td className="numeric">{row.previous_players}</td><td className="numeric">{row.current_players}</td><td className="numeric">{row.overlap_players}</td><td className="numeric"><strong>{row.continuity_rate == null ? "—" : `${(100 * row.continuity_rate).toFixed(0)}%`}</strong></td><td className="numeric">{row.new_players}</td><td className="numeric">{row.departed_players}</td></tr>)}</tbody></table></div><p className="note" style={{ marginTop: 12 }}>This table is intentionally program-level. Use the dated recruiting wire and school or conference statements to verify an individual movement claim.</p></section> : null}
    {error ? <div className="status-error" role="alert"><span>{error}</span><button className="button secondary" type="button" onClick={retryLiveArchive}>Retry live roster</button></div> : !result ? <p className="empty" role="status">Loading Roster rows…</p> : <>
      <div className="section-heading" style={{ marginBottom: 20 }}><p>{result.total.toLocaleString()} matching roster rows · page {page + 1} of {pages} · class, school and hometown fields are retained exactly as supplied by the edition. Shooting columns appear when a same-season shot profile exists.</p><div className="button-row"><button className="button secondary" type="button" onClick={download}>Download page CSV ↓</button><button className="button secondary" type="button" onClick={downloadAll} disabled={exporting}>{exporting ? "Preparing full CSV…" : "Download all matching CSV ↓"}</button><a className="button secondary" href={`/api/basketball/research/ncaa-rosters/source?season=${encodeURIComponent(season)}`}>Download archive ↓</a><button className="button secondary" type="button" onClick={share}>Copy roster link</button></div></div>
      {(copied || exportMessage) && <p role="status">{copied || exportMessage}</p>}
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Player</th><th>Program</th><th>Class / position</th><th>Size</th><th>Hometown</th><th>High school</th><th className="numeric">Roster GP</th><th className="numeric">Roster GS</th><th className="numeric">Recorded PPG</th><th className="numeric">Recorded MPG</th><th className="numeric">Shot ATT</th><th className="numeric">3P%</th><th className="numeric">Rim%</th><th className="numeric">Avg dist.</th></tr></thead><tbody>{result.rows.map((row) => { const p = row.profile; const s = row.shooting; const z = s?.zones || {}; const threeAttempts = safeSum(z.abovebreak3?.attempts, z.corner3?.attempts); const threeMakes = safeSum(z.abovebreak3?.makes, z.corner3?.makes); const three: Zone | undefined = s && threeAttempts != null && threeMakes != null ? { attempts: threeAttempts, makes: threeMakes, points: 0 } : undefined; const recordedPpg = row.recorded_games && row.recorded_points != null ? row.recorded_points / row.recorded_games : null; return <tr key={`${row.team_id}-${row.player_id}`}><td><Link href={`/basketball/ncaa-player/?id=${encodeURIComponent(row.player_id)}&season=${row.season}`}>{row.player_name || row.player_id} →</Link><small>Archive ID {row.player_id}</small><small> · <Link href={`/basketball/ncaa-compare/?ids=${encodeURIComponent(row.player_id)}&season=${row.season}`}>Compare →</Link></small></td><td><strong>{row.team_name || row.team_id}</strong><small>Team ID {row.team_id}</small></td><td>{p.class || "—"}<small>{p.position || "Position unavailable"}</small></td><td>{p.height || "—"}<small>{p.ht_inches ? `${p.ht_inches} in` : ""}</small></td><td>{p.hometown || "—"}</td><td>{p.high_school || "—"}</td><td className="numeric">{p.gp || "—"}</td><td className="numeric">{p.gs || "—"}</td><td className="numeric">{fmt(recordedPpg)}</td><td className="numeric">{fmt(row.recorded_minutes && row.recorded_games ? row.recorded_minutes / row.recorded_games : null)}</td><td className="numeric">{s?.attempts?.toLocaleString() || "—"}</td><td className="numeric">{pct(three)}</td><td className="numeric">{pct(z.rim)}</td><td className="numeric">{s?.distance_count ? `${(s.distance_sum / s.distance_count).toFixed(1)} ft` : "—"}</td></tr>; })}</tbody></table></div>
      {!result.rows.length && <p className="empty">No roster rows match this search.</p>}
      <div className="pagination"><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={(page + 1) * 40 >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div>
      <p className="note" style={{ marginTop: 24 }}>Retained team roster edition. A roster row is descriptive archive context, not a verified recruiting commitment, transfer record, eligibility determination or outside identity match.</p>
    </>}
  </>;
}
