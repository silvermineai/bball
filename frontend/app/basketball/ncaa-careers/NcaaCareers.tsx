"use client";

import { useEffect, useMemo, useState } from "react";

type Metric = "points" | "ppg" | "rpg" | "apg" | "minutes" | "ts";
type Row = { player_id: string; player_name: string | null; seasons: number; games: number; minutes: number; points: number; rebounds: number; assists: number; teams: string | null; value: number; rank: number };
type Result = { from_season: number; to_season: number; metric: Metric; min_seasons: number; min_games: number; page: number; page_size: number; total: number; rows: Row[] };
type Meta = { seasons: number[]; metrics: Metric[] };
const labels: Record<Metric, string> = { points: "Total points", ppg: "Points per game", rpg: "Rebounds per game", apg: "Assists per game", minutes: "Total minutes", ts: "True shooting %" };
const seasonLabel = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const fmt = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);

export default function NcaaCareers() {
  const [fromSeason, setFromSeason] = useState("2010");
  const [toSeason, setToSeason] = useState("2026");
  const [metric, setMetric] = useState<Metric>("points");
  const [minSeasons, setMinSeasons] = useState("2");
  const [minGames, setMinGames] = useState("20");
  const [query, setQuery] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/basketball/research/ncaa-careers?meta=1")
      .then((r) => { if (!r.ok) throw Error("The NCAA career catalog could not be loaded."); return r.json() as Promise<Meta>; })
      .then(setMeta).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ fromSeason, toSeason, metric, minSeasons, minGames, page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    setResult(null);
    fetch(`/api/basketball/research/ncaa-careers?${params}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw Error("The NCAA career leaderboard could not be loaded."); return r.json() as Promise<Result>; })
      .then((value) => { if (!controller.signal.aborted) setResult(value); })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [fromSeason, toSeason, metric, minSeasons, minGames, query, page]);

  const pages = useMemo(() => Math.max(1, Math.ceil((result?.total || 0) / 50)), [result]);
  const reset = (fn: () => void) => { setPage(0); fn(); };
  const seasons = meta?.seasons || Array.from({ length: 17 }, (_, i) => 2026 - i);
  return <>
    <div className="page-title"><div className="eyebrow">NCAA source archive / multi-season careers</div><h1>See the whole<br /><em>player arc.</em></h1><p>Aggregate the attributed NCAA player-season archive across multiple seasons. Career totals preserve the source identity and list every recorded program, so transfers are visible without pretending names are ESPN crosswalks.</p></div>
    <div className="strip"><div><strong>{result?.total.toLocaleString() ?? "—"}</strong><span>Qualified careers</span></div><div><strong>{result ? `${result.from_season}–${result.to_season}` : "—"}</strong><span>Season window</span></div><div><strong>{result?.min_seasons ?? minSeasons}</strong><span>Minimum seasons</span></div><div><strong>NCAA</strong><span>Identity namespace</span></div></div>
    <div className="toolbar">
      <label className="control"><span>FROM</span><select value={fromSeason} onChange={(e) => reset(() => setFromSeason(e.target.value))}>{seasons.slice().sort((a, b) => a - b).map((s) => <option key={s} value={s}>{seasonLabel(s)}</option>)}</select></label>
      <label className="control"><span>THROUGH</span><select value={toSeason} onChange={(e) => reset(() => setToSeason(e.target.value))}>{seasons.map((s) => <option key={s} value={s}>{seasonLabel(s)}</option>)}</select></label>
      <label className="control"><span>RANK BY</span><select value={metric} onChange={(e) => reset(() => setMetric(e.target.value as Metric))}>{(meta?.metrics || Object.keys(labels) as Metric[]).map((m) => <option key={m} value={m}>{labels[m]}</option>)}</select></label>
      <label className="control"><span>MINIMUM SEASONS</span><select value={minSeasons} onChange={(e) => reset(() => setMinSeasons(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} seasons</option>)}</select></label>
      <label className="control"><span>MINIMUM GAMES</span><select value={minGames} onChange={(e) => reset(() => setMinGames(e.target.value))}>{[10, 20, 40, 60, 80].map((n) => <option key={n} value={n}>{n} games</option>)}</select></label>
      <label className="control"><span>PLAYER</span><input type="search" maxLength={120} placeholder="Search a player" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
    </div>
    {error ? <p className="status-error" role="alert">{error}</p> : !result ? <p className="empty" role="status">Loading NCAA career records…</p> : <>
      <p className="note">{result.total.toLocaleString()} qualified careers · ranked by {labels[result.metric].toLowerCase()} · at least {result.min_seasons} seasons and {result.min_games} games.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Player</th><th>Programs observed</th><th className="numeric">SEAS</th><th className="numeric">GP</th><th className="numeric">MIN</th><th className="numeric">PTS</th><th className="numeric">REB</th><th className="numeric">AST</th><th className="numeric">{labels[result.metric]}</th></tr></thead><tbody>{result.rows.map((row) => <tr key={row.player_id}><td className="numeric"><strong>#{row.rank}</strong></td><td><strong>{row.player_name || row.player_id}</strong><small>NCAA player {row.player_id}</small></td><td>{row.teams || "—"}</td><td className="numeric">{fmt(row.seasons, 0)}</td><td className="numeric">{fmt(row.games, 0)}</td><td className="numeric">{fmt(row.minutes, 0)}</td><td className="numeric">{fmt(row.points, 0)}</td><td className="numeric">{fmt(row.rebounds, 0)}</td><td className="numeric">{fmt(row.assists, 0)}</td><td className="numeric"><strong>{fmt(row.value, result.metric === "ts" ? 1 : result.metric === "points" || result.metric === "minutes" ? 0 : 2)}{result.metric === "ts" ? "%" : ""}</strong></td></tr>)}</tbody></table></div>
      {!result.rows.length && <p className="empty">No career records match this filter.</p>}
      <div className="pagination"><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={(page + 1) * 50 >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div>
      <p className="note" style={{ marginTop: 24 }}>Source: NCAA-derived player box release via SportsDataverse. Career totals are descriptive aggregates of rows with the same NCAA player ID; team history shows the source labels observed in the selected window.</p>
    </>}
  </>;
}
