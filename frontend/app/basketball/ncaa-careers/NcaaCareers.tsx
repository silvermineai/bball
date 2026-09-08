"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { downloadCsv, toCsv } from "../../_lib/csv";

type Metric = "points" | "ppg" | "rpg" | "apg" | "minutes" | "ts";
type Row = { season: number; player_id: string; team_id: string; player_name: string | null; team_name: string | null; games: number; minutes: number; points: number; rebounds: number; assists: number; value: number; rank: number };
type Result = { from_season: number; to_season: number; metric: Metric; min_games: number; min_minutes: number; page: number; page_size: number; total: number; rows: Row[] };
type Meta = { seasons: number[]; metrics: Metric[] };
const labels: Record<Metric, string> = { points: "Total points", ppg: "Points per game", rpg: "Rebounds per game", apg: "Assists per game", minutes: "Total minutes", ts: "True shooting %" };
const seasonLabel = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const fmt = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);
const metricFromQuery = (value: string | null): Metric => value && Object.prototype.hasOwnProperty.call(labels, value) ? value as Metric : "points";
const seasonFromQuery = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2010 && parsed <= 2026 ? String(parsed) : String(fallback);
};

export default function NcaaCareers() {
  const initial = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const [fromSeason, setFromSeason] = useState(seasonFromQuery(initial?.get("fromSeason") || null, 2010));
  const [toSeason, setToSeason] = useState(seasonFromQuery(initial?.get("toSeason") || null, 2026));
  const [metric, setMetric] = useState<Metric>(metricFromQuery(initial?.get("metric") || null));
  const [minGames, setMinGames] = useState(initial?.get("minGames") || "20");
  const [minMinutes, setMinMinutes] = useState(initial?.get("minMinutes") || "200");
  const [query, setQuery] = useState(initial?.get("q") || "");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(() => {
    const value = Number(initial?.get("page") || 0);
    return Number.isInteger(value) && value > 0 ? value : 0;
  });
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ fromSeason, toSeason, metric, minGames, minMinutes });
    if (query.trim()) params.set("q", query.trim());
    if (page) params.set("page", String(page));
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [fromSeason, toSeason, metric, minGames, minMinutes, query, page]);

  useEffect(() => {
    fetch("/api/basketball/research/ncaa-careers?meta=1")
      .then((r) => { if (!r.ok) throw Error("The NCAA career catalog could not be loaded."); return r.json() as Promise<Meta>; })
      .then(setMeta).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ fromSeason, toSeason, metric, minGames, minMinutes, page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    setResult(null);
    fetch(`/api/basketball/research/ncaa-careers?${params}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw Error("The NCAA career leaderboard could not be loaded."); return r.json() as Promise<Result>; })
      .then((value) => { if (!controller.signal.aborted) setResult(value); })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [fromSeason, toSeason, metric, minGames, minMinutes, query, page]);

  const pages = useMemo(() => Math.max(1, Math.ceil((result?.total || 0) / 50)), [result]);
  const reset = (fn: () => void) => { setPage(0); fn(); };
  const changeFromSeason = (value: string) => reset(() => {
    setFromSeason(value);
    if (Number(value) > Number(toSeason)) setToSeason(value);
  });
  const changeToSeason = (value: string) => reset(() => {
    setToSeason(value);
    if (Number(value) < Number(fromSeason)) setFromSeason(value);
  });
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Leaderboard link copied.");
    } catch {
      setCopied("Copy the leaderboard URL from your address bar.");
    }
  };
  const download = () => {
    if (!result) return;
    downloadCsv(
      `ncaa-historical-leaderboard-${fromSeason}-${toSeason}-${metric}-page-${page + 1}.csv`,
      toCsv(
        ["From season", "Through season", "Metric", "Rank", "Season", "Player", "NCAA player ID", "Program", "NCAA team ID", "Games", "Minutes", "Points", "Rebounds", "Assists", "Value"],
        result.rows.map((row) => [result.from_season, result.to_season, labels[result.metric], row.rank, row.season, row.player_name, row.player_id, row.team_name, row.team_id, row.games, row.minutes, row.points, row.rebounds, row.assists, row.value]),
      ),
    );
  };
  const seasons = meta?.seasons || Array.from({ length: 17 }, (_, i) => 2026 - i);
  return <>
    <div className="page-title"><div className="eyebrow">NCAA source archive / historical player seasons</div><h1>Put the season<br /><em>in context.</em></h1><p>Search the attributed NCAA player-season archive across a historical window. Each row stays tied to its source season, player ID and program, so eras and workloads can be compared without inventing a cross-season identity join.</p></div>
    <div className="strip"><div><strong>{result?.total.toLocaleString() ?? "—"}</strong><span>Qualified player-seasons</span></div><div><strong>{result ? `${result.from_season}–${result.to_season}` : "—"}</strong><span>Season window</span></div><div><strong>{result?.min_games ?? minGames}</strong><span>Minimum games</span></div><div><strong>NCAA</strong><span>Identity namespace</span></div></div>
    <div className="toolbar">
      <label className="control"><span>FROM</span><select value={fromSeason} onChange={(e) => changeFromSeason(e.target.value)}>{seasons.slice().sort((a, b) => a - b).map((s) => <option key={s} value={s}>{seasonLabel(s)}</option>)}</select></label>
      <label className="control"><span>THROUGH</span><select value={toSeason} onChange={(e) => changeToSeason(e.target.value)}>{seasons.map((s) => <option key={s} value={s}>{seasonLabel(s)}</option>)}</select></label>
      <label className="control"><span>RANK BY</span><select value={metric} onChange={(e) => reset(() => setMetric(e.target.value as Metric))}>{(meta?.metrics || Object.keys(labels) as Metric[]).map((m) => <option key={m} value={m}>{labels[m]}</option>)}</select></label>
      <label className="control"><span>MINIMUM GAMES</span><select value={minGames} onChange={(e) => reset(() => setMinGames(e.target.value))}>{[10, 20, 40, 60, 80].map((n) => <option key={n} value={n}>{n} games</option>)}</select></label>
      <label className="control"><span>MINIMUM MINUTES</span><select value={minMinutes} onChange={(e) => reset(() => setMinMinutes(e.target.value))}>{[0, 200, 400, 600, 800].map((n) => <option key={n} value={n}>{n ? `${n} minutes` : "No minute minimum"}</option>)}</select></label>
      <label className="control"><span>PLAYER</span><input type="search" maxLength={120} placeholder="Search a player" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
    </div>
    {error ? <p className="status-error" role="alert">{error}</p> : !result ? <p className="empty" role="status">Loading NCAA career records…</p> : <>
      <div className="section-heading" style={{ marginBottom: 20 }}><p>{result.total.toLocaleString()} qualified player-seasons · ranked by {labels[result.metric].toLowerCase()} · at least {result.min_games} games and {result.min_minutes} recorded minutes.</p><div className="button-row"><button className="button secondary" type="button" onClick={download}>Download page CSV ↓</button><button className="button secondary" type="button" onClick={share}>Copy leaderboard link</button></div></div>
      {copied && <p role="status">{copied}</p>}
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Player</th><th>Season / program</th><th className="numeric">GP</th><th className="numeric">MIN</th><th className="numeric">PTS</th><th className="numeric">REB</th><th className="numeric">AST</th><th className="numeric">{labels[result.metric]}</th></tr></thead><tbody>{result.rows.map((row) => <tr key={`${row.season}-${row.player_id}-${row.team_id}`}><td className="numeric"><strong>#{row.rank}</strong></td><td><strong>{row.player_name || row.player_id}</strong><small>NCAA player {row.player_id}</small><small><Link href={`/basketball/ncaa-player/?id=${encodeURIComponent(row.player_id)}&season=${row.season}`}>Open source player card →</Link></small><small><a href={`https://stats.ncaa.org/players/${encodeURIComponent(row.player_id)}`} target="_blank" rel="noreferrer">NCAA source ↗</a></small></td><td><strong>{row.team_name || row.team_id}</strong><small>{seasonLabel(row.season)} · NCAA team {row.team_id}</small></td><td className="numeric">{fmt(row.games, 0)}</td><td className="numeric">{fmt(row.minutes, 0)}</td><td className="numeric">{fmt(row.points, 0)}</td><td className="numeric">{fmt(row.rebounds, 0)}</td><td className="numeric">{fmt(row.assists, 0)}</td><td className="numeric"><strong>{fmt(row.value, result.metric === "ts" ? 1 : result.metric === "points" || result.metric === "minutes" ? 0 : 2)}{result.metric === "ts" ? "%" : ""}</strong></td></tr>)}</tbody></table></div>
      {!result.rows.length && <p className="empty">No historical player-seasons match this filter.</p>}
      <div className="pagination"><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={(page + 1) * 50 >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div>
      <p className="note" style={{ marginTop: 24 }}>Source: NCAA-derived player box release via SportsDataverse. The release does not provide a stable cross-season player crosswalk, so this board keeps each player-season row separate rather than treating a name match as a verified career.</p>
    </>}
  </>;
}
