"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv, toCsv } from "../../_lib/csv";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { safeSum } from "../../_lib/ncaa-player-box";
import PlayerShotLocationCourt from "../../_components/PlayerShotLocationCourt";
import { playerCardShotLocations } from "../../_components/LivePlayerShotMap";
import ScopeUnavailable from "../../_components/ScopeUnavailable";
import { parseSportScopeSearch } from "../../_lib/sport-scope";
import { coordinateCoverage } from "./coordinateCoverage";
import { shootingArchiveAvailable, shootingArchiveScopeParams } from "./ncaa-shooting-scope";
import { readShootingMapSelection, writeShootingMapSelection, type ShootingMapSelection } from "./shooting-map-selection";

type Metric = "volume" | "fg_pct" | "3p_pct" | "rim_pct" | "mid_pct" | "distance" | "rim_share" | "paint_share" | "mid_share" | "three_share";
type Zone = { attempts: number; makes: number; points: number };
type Row = { season: number; player_id: string; team_id: string; player_name: string | null; team_name: string | null; value: number; stats: { attempts: number; makes: number; points: number; distance_sum: number; distance_count: number; zones: Record<string, Zone>; coordinate_count?: number | null; located_count?: number | null; identity_basis?: string } };
type Result = { season: number; metric: Metric; min_attempts: number; page: number; page_size: number; total: number; rows: Row[] };
type Meta = { seasons: number[]; metrics: Metric[]; source?: { fetched_at?: string | null; sha256?: string | null } };
type PlayerCard = {
  shooting?: Array<{
    season: number;
    team_id: string;
    stats: { coordinates?: Array<{
      contest_id?: string | null;
      x: number | null;
      y: number | null;
      zone?: string | null;
      type?: string | null;
      made?: boolean | number | null;
      points?: number | null;
    } | [string | null, number | null, number | null, number | null, string | null, string | null, boolean | number | null, number | null]> };
  }>;
};
const labels: Record<Metric, string> = { volume: "Shot attempts", fg_pct: "Overall FG%", "3p_pct": "3-point %", rim_pct: "Rim %", mid_pct: "Midrange %", distance: "Average distance", rim_share: "Rim attempt share", paint_share: "Paint attempt share", mid_share: "Midrange attempt share", three_share: "3-point attempt share" };
const percentageMetrics = new Set<Metric>(["fg_pct", "3p_pct", "rim_pct", "mid_pct", "rim_share", "paint_share", "mid_share", "three_share"]);
const label = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const pct = (zone: Zone | undefined) => zone && zone.attempts ? `${(100 * zone.makes / zone.attempts).toFixed(1)}%` : "—";
const sourceLabelRow = (row: Row) => row.player_id.startsWith("source:") || row.team_id.startsWith("source:");

export default function NcaaShooting() {
  const searchParams = useSearchParams();
  const scopeSearch = searchParams.toString();
  const scope = useMemo(() => parseSportScopeSearch(scopeSearch), [scopeSearch]);
  const requestedMapSelection = useMemo(() => readShootingMapSelection(searchParams), [scopeSearch, searchParams]);
  const initialMetric = searchParams.get("metric");
  const [season, setSeason] = useState(searchParams.get("season") || "2026");
  const [metric, setMetric] = useState<Metric>(initialMetric && Object.prototype.hasOwnProperty.call(labels, initialMetric) ? initialMetric as Metric : "volume");
  const [minAttempts, setMinAttempts] = useState(searchParams.get("minAttempts") || "50");
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(() => {
    const value = Number(searchParams.get("page") || 0);
    return Number.isInteger(value) && value > 0 ? value : 0;
  });
  const [error, setError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [mapPlayer, setMapPlayer] = useState<Row | null>(null);
  // Keep the selected archive identity in the URL so a coach can share a
  // filtered table with the exact court profile already open.
  const [mapSelection, setMapSelection] = useState<ShootingMapSelection | null>(requestedMapSelection);
  const [mapCard, setMapCard] = useState<PlayerCard | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState("");
  const [copied, setCopied] = useState(""), [exporting, setExporting] = useState(false), [exportMessage, setExportMessage] = useState("");
  useEffect(() => { if (!shootingArchiveAvailable(scope)) return; const params = new URLSearchParams({ season, metric, minAttempts }); if (query.trim()) params.set("q", query.trim()); if (page) params.set("page", String(page)); shootingArchiveScopeParams(scope).forEach((value, key) => params.set(key, value)); writeShootingMapSelection(params, mapSelection); window.history.replaceState(null, "", `${window.location.pathname}?${params}`); }, [season, metric, minAttempts, query, page, scope, mapSelection]);
  useEffect(() => { if (!shootingArchiveAvailable(scope)) return; fetch(`/api/basketball/research/ncaa-shooting?meta=1&season=${season}`).then((r) => { if (!r.ok) throw Error("The College shooting catalog could not be loaded."); return r.json() as Promise<Meta>; }).then(setMeta).catch((e) => setError(e.message)); }, [retryNonce, season, scope]);
  useEffect(() => { if (!shootingArchiveAvailable(scope)) return; const controller = new AbortController(); const params = new URLSearchParams({ season, metric, minAttempts, page: String(page) }); if (query.trim()) params.set("q", query.trim()); setResult(null); fetch(`/api/basketball/research/ncaa-shooting?${params}`, { signal: controller.signal }).then((r) => { if (!r.ok) throw Error("The College shooting profiles could not be loaded."); return r.json() as Promise<Result>; }).then((v) => { if (!controller.signal.aborted) setResult(v); }).catch((e) => { if (e.name !== "AbortError") setError(e.message); }); return () => controller.abort(); }, [metric, minAttempts, page, query, retryNonce, season, scope]);
  const pages = useMemo(() => Math.max(1, Math.ceil((result?.total || 0) / 40)), [result]);
  const reset = (fn: () => void) => { setPage(0); fn(); };
  const retryLiveArchive = () => { setError(""); setRetryNonce((value) => value + 1); };
  const closeMap = () => {
    setMapPlayer(null);
    setMapSelection(null);
    setMapCard(null);
    setMapLoading(false);
    setMapError("");
  };
  const openMap = (row: Row) => {
    if (sourceLabelRow(row)) return;
    if (mapPlayer?.player_id === row.player_id && mapPlayer.team_id === row.team_id) {
      closeMap();
      return;
    }
    setMapPlayer(row);
    setMapSelection({ playerId: row.player_id, teamId: row.team_id });
    setMapCard(null);
    setMapError("");
    setMapLoading(true);
    fetch(`/api/basketball/research/ncaa-player-card/${encodeURIComponent(row.player_id)}?season=${row.season}`)
      .then((response) => {
        if (!response.ok) throw new Error("This player’s shot coordinates could not be loaded.");
        return response.json() as Promise<PlayerCard>;
      })
      .then((payload) => setMapCard(payload))
      .catch((reason: unknown) => setMapError(reason instanceof Error ? reason.message : "This player’s shot coordinates could not be loaded."))
      .finally(() => setMapLoading(false));
  };
  // A copied shooting URL can open a map as soon as its row is available. If
  // a filter or page no longer contains that identity, clear the stale map
  // instead of showing a profile disconnected from the visible table.
  useEffect(() => {
    if (!result) return;
    if (mapPlayer) {
      if (!result.rows.some((row) => row.player_id === mapPlayer.player_id && row.team_id === mapPlayer.team_id)) closeMap();
      return;
    }
    if (!mapSelection) return;
    const row = result.rows.find((candidate) => candidate.player_id === mapSelection.playerId && candidate.team_id === mapSelection.teamId);
    if (row && !sourceLabelRow(row)) openMap(row);
    else setMapSelection(null);
  }, [result, mapPlayer, mapSelection]);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Shooting link copied.");
    } catch {
      setCopied("Copy the shooting URL from your address bar.");
    }
  };
  const exportHeaders = ["Season", "Metric", "Minimum attempts", "Player", "Archive player ID", "Program", "Archive team ID", "Attempts", "Located coordinates", "Makes", "Points", "Average distance", "FG%", "3P%", "Rim%", "Midrange%", "Raw recorded stats JSON"];
  const exportRow = (row: Row, active: Result) => {
    const z = row.stats.zones || {};
    const threeAttempts = safeSum(z.abovebreak3?.attempts, z.corner3?.attempts);
    const threeMakes = safeSum(z.abovebreak3?.makes, z.corner3?.makes);
    return [active.season, labels[active.metric], active.min_attempts, row.player_name, row.player_id, row.team_name, row.team_id, row.stats.attempts, row.stats.located_count ?? null, row.stats.makes, row.stats.points, row.stats.distance_count ? row.stats.distance_sum / row.stats.distance_count : null, row.stats.attempts ? 100 * row.stats.makes / row.stats.attempts : null, threeAttempts != null && threeMakes != null && threeAttempts > 0 ? 100 * threeMakes / threeAttempts : null, z.rim?.attempts ? 100 * z.rim.makes / z.rim.attempts : null, z.mid?.attempts ? 100 * z.mid.makes / z.mid.attempts : null, JSON.stringify(row.stats)];
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
  if (!shootingArchiveAvailable(scope)) return <ScopeUnavailable sport="basketball" scope={scope} />;
  return <>
    <div className="page-title"><div className="eyebrow">Player shooting archive</div><h1>Follow the<br /><em>shot profile.</em></h1><p>Compare where players shoot, how often they convert and how their shot diet changes across seasons. Zone buckets and distance come from the retained shot edition.</p></div>
    <div className="strip"><div><strong>{result?.total.toLocaleString() ?? "—"}</strong><span>Qualified player/team profiles</span></div><div><strong>{result?.min_attempts ?? minAttempts}</strong><span>Minimum attempts</span></div><div><strong>{meta?.seasons.length ?? "—"}</strong><span>Shot seasons</span></div><div><strong>IDs</strong><span>Identity namespaces</span></div></div>
    <div className="toolbar"><label className="control"><span>SEASON</span><select value={season} onChange={(e) => reset(() => setSeason(e.target.value))}>{(meta?.seasons || [2026]).map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label><label className="control"><span>RANK BY</span><select value={metric} onChange={(e) => reset(() => setMetric(e.target.value as Metric))}>{(meta?.metrics || Object.keys(labels) as Metric[]).map((m) => <option key={m} value={m}>{labels[m]}</option>)}</select></label><label className="control"><span>MINIMUM ATTEMPTS</span><select value={minAttempts} onChange={(e) => reset(() => setMinAttempts(e.target.value))}>{[10, 50, 100, 200, 400].map((n) => <option key={n} value={n}>{n} attempts</option>)}</select></label><label className="control"><span>PLAYER OR TEAM</span><input type="search" maxLength={120} placeholder="Search a player or team" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label></div>
    {error ? <div className="status-error" role="alert"><span>{error}</span><button className="button secondary" type="button" onClick={retryLiveArchive}>Retry live shooting</button></div> : !result ? <p className="empty" role="status">Loading shooting profiles…</p> : <><div className="section-heading" style={{ marginBottom: 20 }}><p>{result.total.toLocaleString()} qualified profiles · ranked by {labels[result.metric].toLowerCase()} · minimum {result.min_attempts} attempts.</p><div className="button-row"><button className="button secondary" type="button" onClick={download}>Download page CSV ↓</button><button className="button secondary" type="button" onClick={downloadAll} disabled={exporting}>{exporting ? "Preparing full CSV…" : "Download all matching CSV ↓"}</button><a className="button secondary" href={`/api/basketball/research/ncaa-shooting/source?season=${encodeURIComponent(season)}`}>Download archive ↓</a><button className="button secondary" type="button" onClick={share}>Copy shooting link</button></div></div>{(copied || exportMessage) && <p role="status">{copied || exportMessage}</p>}{mapPlayer && <section className="paper-panel" aria-label="Selected player shot map" style={{ marginBottom: 20 }}><div className="section-heading"><div><div className="eyebrow">Selected row / Court coordinates</div><h2>{mapPlayer.player_name || mapPlayer.player_id}</h2><p className="note">{mapPlayer.team_name || mapPlayer.team_id} · {mapPlayer.stats.attempts.toLocaleString()} recorded attempts · season {label(mapPlayer.season)}</p></div><button className="button secondary" type="button" onClick={() => { setMapPlayer(null); setMapCard(null); }}>Close map</button></div>{mapError ? <p className="status-error" role="alert">{mapError}</p> : mapLoading ? <p className="empty" role="status">Loading recorded court coordinates…</p> : mapCard ? <PlayerShotLocationCourt shots={playerCardShotLocations(mapCard as Parameters<typeof playerCardShotLocations>[0], mapPlayer.season, mapPlayer.player_id, mapPlayer.team_id)} recordedAttempts={mapPlayer.stats.attempts} playerName={mapPlayer.player_name || mapPlayer.player_id} title={`${mapPlayer.player_name || "Player"} shot profile`} /> : <p className="empty">No coordinate payload is available for this player.</p>}</section>}<div className="table-scroll"><table className="data-table"><thead><tr><th>Player</th><th>Program</th><th className="numeric">ATT</th><th className="numeric">Located / ATT</th><th className="numeric">FG%</th><th className="numeric">3P%</th><th className="numeric">Rim%</th><th className="numeric">Mid%</th><th className="numeric">Avg dist.</th><th className="numeric">{labels[result.metric]}</th><th>Map</th></tr></thead><tbody>{result.rows.map((row) => { const z = row.stats.zones || {}; const threeAttempts = safeSum(z.abovebreak3?.attempts, z.corner3?.attempts); const threeMakes = safeSum(z.abovebreak3?.makes, z.corner3?.makes); const three = threeAttempts != null && threeMakes != null ? { attempts: threeAttempts, makes: threeMakes, points: 0 } : undefined; const sourceOnly = sourceLabelRow(row); const playerHref = `/basketball/ncaa-player/?id=${encodeURIComponent(row.player_id)}&season=${row.season}`; return <tr key={`${row.player_id}-${row.team_id}`}><td>{sourceOnly ? <><strong>{row.player_name || row.player_id}</strong><small>Archive label only · no canonical archive ID</small></> : <><Link href={playerHref}><strong>{row.player_name || row.player_id}</strong></Link><small><Link href={playerHref}>Open shot map →</Link></small></>}</td><td><strong>{row.team_name || row.team_id}</strong><small>{sourceOnly ? "Archive team label only" : `Team ID ${row.team_id}`}</small></td><td className="numeric">{row.stats.attempts.toLocaleString()}</td><td className="numeric"><span title="Validated x/y points / recorded attempts">{coordinateCoverage(row.stats)}</span></td><td className="numeric">{pct({ attempts: row.stats.attempts, makes: row.stats.makes, points: row.stats.points })}</td><td className="numeric">{pct(three)}</td><td className="numeric">{pct(z.rim)}</td><td className="numeric">{pct(z.mid)}</td><td className="numeric">{row.stats.distance_count ? `${(row.stats.distance_sum / row.stats.distance_count).toFixed(1)} ft` : "—"}</td><td className="numeric"><strong>{row.value.toFixed(result.metric === "volume" ? 0 : 1)}{percentageMetrics.has(result.metric) ? "%" : result.metric === "distance" ? " ft" : ""}</strong></td><td>{sourceOnly ? "—" : <button className="button secondary" type="button" onClick={() => openMap(row)} aria-pressed={mapPlayer?.player_id === row.player_id && mapPlayer.team_id === row.team_id}>{mapPlayer?.player_id === row.player_id && mapPlayer.team_id === row.team_id ? "Hide map" : "View map"}</button>}</td></tr>; })}</tbody></table></div>{!result.rows.length && <p className="empty">No shooting profiles match this filter.</p>}<div className="pagination"><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={(page + 1) * 40 >= result.total}>Next →</button></div><p className="note" style={{ marginTop: 24 }}>Retained shot edition{meta?.source?.fetched_at ? ` · receipt fetched ${new Date(meta.source.fetched_at).toLocaleDateString()}` : ""}. Archive-labeled profiles preserve published shooter/team labels when numeric archive IDs are absent; they are searchable aggregates and are deliberately withheld from Archive ID links. “Located / ATT” uses only retained records with valid x/y coordinates; a dash means that location coverage was not reported. The clock describes the retained edition, not a live shot correction or eligibility update.</p></>}
  </>;
}
