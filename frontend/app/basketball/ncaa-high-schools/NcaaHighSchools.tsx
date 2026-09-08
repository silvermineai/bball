"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Metric = "players" | "programs" | "games" | "points" | "ppg";
type Row = { high_school: string; players: number; programs: number; games: number; points: number; value: number; rank: number };
type Result = { season: number; metric: Metric; min_players: number; page: number; page_size: number; total: number; rows: Row[] };
type Meta = { seasons: number[]; total: number; metrics: Metric[] };
const labels: Record<Metric, string> = { players: "Rostered players", programs: "Programs represented", games: "Recorded games", points: "Recorded points", ppg: "Points per recorded game" };
const seasonLabel = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const fmt = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);

export default function NcaaHighSchools() {
  const [season, setSeason] = useState("2026");
  const [metric, setMetric] = useState<Metric>("players");
  const [minPlayers, setMinPlayers] = useState("1");
  const [query, setQuery] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/basketball/research/ncaa-high-schools?meta=1&season=${season}`)
      .then((r) => { if (!r.ok) throw Error("The NCAA high-school catalog could not be loaded."); return r.json() as Promise<Meta>; })
      .then(setMeta).catch((e) => setError(e.message));
  }, [season]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ season, metric, minPlayers, page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    setResult(null);
    fetch(`/api/basketball/research/ncaa-high-schools?${params}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw Error("The NCAA high-school pipeline could not be loaded."); return r.json() as Promise<Result>; })
      .then((value) => { if (!controller.signal.aborted) setResult(value); })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [season, metric, minPlayers, query, page]);

  const pages = useMemo(() => Math.max(1, Math.ceil((result?.total || 0) / 50)), [result]);
  const reset = (fn: () => void) => { setPage(0); fn(); };
  const seasons = meta?.seasons || Array.from({ length: 17 }, (_, i) => 2026 - i);
  return <>
    <div className="page-title"><div className="eyebrow">NCAA source archive / high-school pipeline</div><h1>Follow the<br /><em>pipeline.</em></h1><p>See which source-labeled high schools appear in NCAA rosters, how many programs they represent and how much recorded college production sits behind the roster rows. This is descriptive coverage, not a recruiting ranking.</p></div>
    <div className="strip"><div><strong>{result?.total.toLocaleString() ?? meta?.total.toLocaleString() ?? "—"}</strong><span>High schools in view</span></div><div><strong>{result?.min_players ?? minPlayers}</strong><span>Minimum rostered players</span></div><div><strong>{meta?.seasons.length ?? "—"}</strong><span>Source seasons</span></div><div><strong>NCAA</strong><span>Identity namespace</span></div></div>
    <div className="toolbar">
      <label className="control"><span>SEASON</span><select value={season} onChange={(e) => reset(() => setSeason(e.target.value))}>{seasons.map((s) => <option key={s} value={s}>{seasonLabel(s)}</option>)}</select></label>
      <label className="control"><span>RANK BY</span><select value={metric} onChange={(e) => reset(() => setMetric(e.target.value as Metric))}>{(meta?.metrics || Object.keys(labels) as Metric[]).map((m) => <option key={m} value={m}>{labels[m]}</option>)}</select></label>
      <label className="control"><span>MINIMUM PLAYERS</span><select value={minPlayers} onChange={(e) => reset(() => setMinPlayers(e.target.value))}>{[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n} players</option>)}</select></label>
      <label className="control"><span>HIGH SCHOOL</span><input type="search" maxLength={120} placeholder="Search a source school label" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
    </div>
    {error ? <p className="status-error" role="alert">{error}</p> : !result ? <p className="empty" role="status">Loading high-school pipeline…</p> : <>
      <p className="note">{result.total.toLocaleString()} high-school labels · ranked by {labels[result.metric].toLowerCase()} · source roster rows only.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>High school</th><th className="numeric">Players</th><th className="numeric">Programs</th><th className="numeric">Games</th><th className="numeric">Points</th><th className="numeric">{labels[result.metric]}</th><th>Evidence</th></tr></thead><tbody>{result.rows.map((row) => <tr key={row.high_school}><td className="numeric"><strong>#{row.rank}</strong></td><td><strong>{row.high_school}</strong></td><td className="numeric">{fmt(row.players, 0)}</td><td className="numeric">{fmt(row.programs, 0)}</td><td className="numeric">{fmt(row.games, 0)}</td><td className="numeric">{fmt(row.points, 0)}</td><td className="numeric"><strong>{fmt(row.value, result.metric === "ppg" ? 1 : 0)}</strong></td><td><Link href={`/basketball/ncaa-rosters/?season=${result.season}&q=${encodeURIComponent(row.high_school)}`}>Open roster rows →</Link></td></tr>)}</tbody></table></div>
      {!result.rows.length && <p className="empty">No source high-school labels match this filter.</p>}
      <div className="pagination"><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={(page + 1) * 50 >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div>
      <p className="note" style={{ marginTop: 24 }}>Source: NCAA-derived team roster release via SportsDataverse. High-school labels are retained as supplied and may reflect spelling or campus naming differences; the aggregation does not assert a recruiting relationship, commitment, or athlete identity beyond the source row.</p>
    </>}
  </>;
}
