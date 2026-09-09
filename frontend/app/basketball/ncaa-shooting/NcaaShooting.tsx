"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv, toCsv } from "../../_lib/csv";
import Link from "next/link";

type Metric = "volume" | "fg_pct" | "3p_pct" | "rim_pct" | "mid_pct" | "distance";
type Zone = { attempts: number; makes: number; points: number };
type Row = { season: number; player_id: string; team_id: string; player_name: string | null; team_name: string | null; value: number; stats: { attempts: number; makes: number; points: number; distance_sum: number; distance_count: number; zones: Record<string, Zone> } };
type Result = { season: number; metric: Metric; min_attempts: number; page: number; page_size: number; total: number; rows: Row[] };
type Meta = { seasons: number[]; metrics: Metric[]; source?: { fetched_at?: string | null; sha256?: string | null } };
const labels: Record<Metric, string> = { volume: "Shot attempts", fg_pct: "Overall FG%", "3p_pct": "3-point %", rim_pct: "Rim %", mid_pct: "Midrange %", distance: "Average distance" };
const label = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const pct = (zone: Zone | undefined) => zone && zone.attempts ? `${(100 * zone.makes / zone.attempts).toFixed(1)}%` : "—";

export default function NcaaShooting() {
  const initial = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const initialMetric = initial?.get("metric");
  const [season, setSeason] = useState(initial?.get("season") || "2026");
  const [metric, setMetric] = useState<Metric>(initialMetric && Object.prototype.hasOwnProperty.call(labels, initialMetric) ? initialMetric as Metric : "volume");
  const [minAttempts, setMinAttempts] = useState(initial?.get("minAttempts") || "50");
  const [query, setQuery] = useState(initial?.get("q") || "");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(() => {
    const value = Number(initial?.get("page") || 0);
    return Number.isInteger(value) && value > 0 ? value : 0;
  });
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(""), [exporting, setExporting] = useState(false), [exportMessage, setExportMessage] = useState("");
  useEffect(() => { const params = new URLSearchParams({ season, metric, minAttempts }); if (query.trim()) params.set("q", query.trim()); if (page) params.set("page", String(page)); window.history.replaceState(null, "", `${window.location.pathname}?${params}`); }, [season, metric, minAttempts, query, page]);
  useEffect(() => { fetch(`/api/basketball/research/ncaa-shooting?meta=1&season=${season}`).then((r) => { if (!r.ok) throw Error("The NCAA shooting catalog could not be loaded."); return r.json() as Promise<Meta>; }).then(setMeta).catch((e) => setError(e.message)); }, [season]);
  useEffect(() => { const controller = new AbortController(); const params = new URLSearchParams({ season, metric, minAttempts, page: String(page) }); if (query.trim()) params.set("q", query.trim()); setResult(null); fetch(`/api/basketball/research/ncaa-shooting?${params}`, { signal: controller.signal }).then((r) => { if (!r.ok) throw Error("The NCAA shooting profiles could not be loaded."); return r.json() as Promise<Result>; }).then((v) => { if (!controller.signal.aborted) setResult(v); }).catch((e) => { if (e.name !== "AbortError") setError(e.message); }); return () => controller.abort(); }, [season, metric, minAttempts, query, page]);
  const pages = useMemo(() => Math.max(1, Math.ceil((result?.total || 0) / 40)), [result]);
  const reset = (fn: () => void) => { setPage(0); fn(); };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Shooting link copied.");
    } catch {
      setCopied("Copy the shooting URL from your address bar.");
    }
  };
  const exportHeaders = ["Season", "Metric", "Minimum attempts", "Player", "NCAA player ID", "NCAA player source URL", "Program", "NCAA team ID", "NCAA team source URL", "Attempts", "Makes", "Points", "Average distance", "FG%", "3P%", "Rim%", "Midrange%", "Raw source stats JSON"];
  const exportRow = (row: Row, active: Result) => {
    const z = row.stats.zones || {};
    const threeAttempts = (z.abovebreak3?.attempts || 0) + (z.corner3?.attempts || 0);
    const threeMakes = (z.abovebreak3?.makes || 0) + (z.corner3?.makes || 0);
    return [active.season, labels[active.metric], active.min_attempts, row.player_name, row.player_id, `https://stats.ncaa.org/players/${encodeURIComponent(row.player_id)}`, row.team_name, row.team_id, `https://stats.ncaa.org/teams/${encodeURIComponent(row.team_id)}`, row.stats.attempts, row.stats.makes, row.stats.points, row.stats.distance_count ? row.stats.distance_sum / row.stats.distance_count : null, row.stats.attempts ? 100 * row.stats.makes / row.stats.attempts : null, threeAttempts ? 100 * threeMakes / threeAttempts : null, z.rim?.attempts ? 100 * z.rim.makes / z.rim.attempts : null, z.mid?.attempts ? 100 * z.mid.makes / z.mid.attempts : null, JSON.stringify(row.stats)];
  };
  const download = () => {
    if (!result) return;
    downloadCsv(`ncaa-shooting-${season}-${metric}-page-${page + 1}.csv`, toCsv(exportHeaders, result.rows.map((row) => exportRow(row, result))));
  };
  const downloadAll = async () => {
    if (!result || exporting) return;
    const totalPages = Math.ceil(result.total / result.page_size);
    if (totalPages > 1001) {
      setExportMessage("This cohort exceeds the bounded export window. Add a player, team or attempt filter first.");
      return;
    }
    setExporting(true);
    setExportMessage(`Preparing 0 of ${result.total.toLocaleString()} rows…`);
    try {
      const rows: Row[] = [];
      for (let requestedPage = 0; requestedPage < totalPages; requestedPage += 1) {
        const params = new URLSearchParams({ season, metric, minAttempts, page: String(requestedPage) });
        if (query.trim()) params.set("q", query.trim());
        const response = await fetch(`/api/basketball/research/ncaa-shooting?${params}`);
        if (!response.ok) throw new Error("The complete shooting export could not be loaded.");
        const payload = await response.json() as Result;
        rows.push(...payload.rows);
        setExportMessage(`Preparing ${rows.length.toLocaleString()} of ${result.total.toLocaleString()} rows…`);
      }
      downloadCsv(`ncaa-shooting-${season}-${metric}-all.csv`, toCsv(exportHeaders, rows.map((row) => exportRow(row, result))));
      setExportMessage(`Downloaded ${rows.length.toLocaleString()} shooting profiles.`);
    } catch (reason) {
      setExportMessage(reason instanceof Error ? reason.message : "The complete shooting export could not be loaded.");
    } finally {
      setExporting(false);
    }
  };
  return <>
    <div className="page-title"><div className="eyebrow">NCAA source archive / player shooting</div><h1>Follow the<br /><em>shot profile.</em></h1><p>Compare where players shoot, how often they convert and how their shot diet changes across seasons. Zone buckets and distance come from the attributed NCAA shot release.</p></div>
    <div className="strip"><div><strong>{result?.total.toLocaleString() ?? "—"}</strong><span>Qualified player/team profiles</span></div><div><strong>{result?.min_attempts ?? minAttempts}</strong><span>Minimum attempts</span></div><div><strong>{meta?.seasons.length ?? "—"}</strong><span>Shot seasons</span></div><div><strong>NCAA</strong><span>Identity namespace</span></div></div>
    <div className="toolbar"><label className="control"><span>SEASON</span><select value={season} onChange={(e) => reset(() => setSeason(e.target.value))}>{(meta?.seasons || [2026]).map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label><label className="control"><span>RANK BY</span><select value={metric} onChange={(e) => reset(() => setMetric(e.target.value as Metric))}>{(meta?.metrics || Object.keys(labels) as Metric[]).map((m) => <option key={m} value={m}>{labels[m]}</option>)}</select></label><label className="control"><span>MINIMUM ATTEMPTS</span><select value={minAttempts} onChange={(e) => reset(() => setMinAttempts(e.target.value))}>{[10, 50, 100, 200, 400].map((n) => <option key={n} value={n}>{n} attempts</option>)}</select></label><label className="control"><span>PLAYER OR TEAM</span><input type="search" maxLength={120} placeholder="Search a player or team" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label></div>
    {error ? <p className="status-error" role="alert">{error}</p> : !result ? <p className="empty" role="status">Loading NCAA shooting profiles…</p> : <><div className="section-heading" style={{ marginBottom: 20 }}><p>{result.total.toLocaleString()} qualified profiles · ranked by {labels[result.metric].toLowerCase()} · minimum {result.min_attempts} attempts.</p><div className="button-row"><button className="button secondary" type="button" onClick={download}>Download page CSV ↓</button><button className="button secondary" type="button" onClick={downloadAll} disabled={exporting}>{exporting ? "Preparing full CSV…" : "Download all matching CSV ↓"}</button><a className="button secondary" href={`/api/basketball/research/ncaa-shooting/source?season=${encodeURIComponent(season)}`}>Download source parquet ↓</a><button className="button secondary" type="button" onClick={share}>Copy shooting link</button></div></div>{(copied || exportMessage) && <p role="status">{copied || exportMessage}</p>}<div className="table-scroll"><table className="data-table"><thead><tr><th>Player</th><th>Program</th><th className="numeric">ATT</th><th className="numeric">FG%</th><th className="numeric">3P%</th><th className="numeric">Rim%</th><th className="numeric">Mid%</th><th className="numeric">Avg dist.</th><th className="numeric">{labels[result.metric]}</th></tr></thead><tbody>{result.rows.map((row) => { const z = row.stats.zones || {}; return <tr key={`${row.player_id}-${row.team_id}`}><td><Link href={`/basketball/ncaa-player/?id=${encodeURIComponent(row.player_id)}&season=${row.season}`}><strong>{row.player_name || row.player_id}</strong></Link><small>NCAA player {row.player_id}</small><small><a href={`https://stats.ncaa.org/players/${encodeURIComponent(row.player_id)}`} target="_blank" rel="noreferrer">NCAA source ↗</a></small></td><td><strong>{row.team_name || row.team_id}</strong><small>NCAA team {row.team_id}</small></td><td className="numeric">{row.stats.attempts.toLocaleString()}</td><td className="numeric">{pct({ attempts: row.stats.attempts, makes: row.stats.makes, points: row.stats.points })}</td><td className="numeric">{pct({ attempts: (z.abovebreak3?.attempts || 0) + (z.corner3?.attempts || 0), makes: (z.abovebreak3?.makes || 0) + (z.corner3?.makes || 0), points: 0 })}</td><td className="numeric">{pct(z.rim)}</td><td className="numeric">{pct(z.mid)}</td><td className="numeric">{row.stats.distance_count ? `${(row.stats.distance_sum / row.stats.distance_count).toFixed(1)} ft` : "—"}</td><td className="numeric"><strong>{row.value.toFixed(result.metric === "volume" ? 0 : 1)}{result.metric.endsWith("pct") ? "%" : result.metric === "distance" ? " ft" : ""}</strong></td></tr>; })}</tbody></table></div>{!result.rows.length && <p className="empty">No shooting profiles match this filter.</p>}<div className="pagination"><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={(page + 1) * 40 >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div><p className="note" style={{ marginTop: 24 }}>Source: NCAA-derived shot release via SportsDataverse{meta?.source?.fetched_at ? ` · receipt fetched ${new Date(meta.source.fetched_at).toLocaleDateString()}` : ""}. The clock describes the retained source edition, not a live shot correction or eligibility update. A profile describes recorded shot locations and outcomes; it does not imply a future role or a verified match to ESPN identities.</p></>}
  </>;
}
