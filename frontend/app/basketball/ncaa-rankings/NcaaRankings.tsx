"use client";

import { useEffect, useMemo, useState } from "react";

type Metric = "ppg" | "rpg" | "apg" | "spg" | "bpg" | "ts" | "efg" | "per40";
type Row = { season: number; player_id: string; team_id: string; player_name: string | null; team_name: string | null; games: number; minutes: number; points: number; rebounds: number; assists: number; steals: number; blocks: number; value: number; rank: number };
type Result = { season: number; metric: Metric; min_games: number; page: number; page_size: number; total: number; rows: Row[] };
type Meta = { seasons: number[]; metrics: Metric[] };
const labels: Record<Metric, string> = { ppg: "Points per game", rpg: "Rebounds per game", apg: "Assists per game", spg: "Steals per game", bpg: "Blocks per game", ts: "True shooting %", efg: "Effective FG %", per40: "Points per 40 minutes" };
const label = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const fmt = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);

export default function NcaaRankings() {
  const [season, setSeason] = useState("2026");
  const [metric, setMetric] = useState<Metric>("ppg");
  const [minGames, setMinGames] = useState("5");
  const [query, setQuery] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/basketball/research/ncaa-player-rankings?meta=1&season=${season}`)
      .then((r) => { if (!r.ok) throw Error("The NCAA ranking catalog could not be loaded."); return r.json() as Promise<Meta>; })
      .then(setMeta).catch((e) => setError(e.message));
  }, [season]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ season, metric, minGames, page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    setResult(null);
    fetch(`/api/basketball/research/ncaa-player-rankings?${params}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw Error("The NCAA rankings could not be loaded."); return r.json() as Promise<Result>; })
      .then((value) => { if (!controller.signal.aborted) setResult(value); })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [season, metric, minGames, query, page]);

  const pages = useMemo(() => Math.max(1, Math.ceil((result?.total || 0) / 50)), [result]);
  const reset = (fn: () => void) => { setPage(0); fn(); };
  return <>
    <div className="page-title">
      <div className="eyebrow">NCAA source archive / player rankings</div>
      <h1>Find the next<br /><em>difference maker.</em></h1>
      <p>Rank game-level NCAA-derived production with a coach&apos;s minimum sample. Every board shows the source identity, workload and the metric used to order the list.</p>
    </div>
    <div className="strip">
      <div><strong>{result?.total.toLocaleString() ?? "—"}</strong><span>Qualified player/team rows</span></div>
      <div><strong>{result?.min_games ?? minGames}</strong><span>Minimum games</span></div>
      <div><strong>{meta?.seasons.length ?? "—"}</strong><span>Source seasons</span></div>
      <div><strong>NCAA</strong><span>Identity namespace</span></div>
    </div>
    <div className="toolbar">
      <label className="control"><span>SEASON</span><select value={season} onChange={(e) => reset(() => setSeason(e.target.value))}>{(meta?.seasons || [2026]).map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
      <label className="control"><span>RANK BY</span><select value={metric} onChange={(e) => reset(() => setMetric(e.target.value as Metric))}>{(meta?.metrics || ["ppg", "rpg", "apg", "spg", "bpg", "ts", "efg", "per40"]).map((m) => <option key={m} value={m}>{labels[m]}</option>)}</select></label>
      <label className="control"><span>MINIMUM GAMES</span><select value={minGames} onChange={(e) => reset(() => setMinGames(e.target.value))}>{[1, 5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} games</option>)}</select></label>
      <label className="control"><span>PLAYER OR TEAM</span><input type="search" maxLength={120} placeholder="Search a player or team" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
    </div>
    {error ? <p className="status-error" role="alert">{error}</p> : !result ? <p className="empty" role="status">Loading NCAA rankings…</p> : <>
      <p className="note">{result.total.toLocaleString()} qualified player/team rows · ranked by {labels[result.metric].toLowerCase()} · rates use only recorded game rows.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Player</th><th>Program</th><th className="numeric">GP</th><th className="numeric">MIN</th><th className="numeric">PTS</th><th className="numeric">REB</th><th className="numeric">AST</th><th className="numeric">{labels[result.metric]}</th></tr></thead><tbody>{result.rows.map((row) => <tr key={`${row.player_id}-${row.team_id}`}><td className="numeric"><strong>#{row.rank}</strong></td><td><strong>{row.player_name || row.player_id}</strong><small>NCAA player {row.player_id}</small></td><td><strong>{row.team_name || row.team_id}</strong><small>NCAA team {row.team_id}</small></td><td className="numeric">{fmt(row.games, 0)}</td><td className="numeric">{fmt(row.minutes, 0)}</td><td className="numeric">{fmt(row.points, 0)}</td><td className="numeric">{fmt(row.rebounds, 0)}</td><td className="numeric">{fmt(row.assists, 0)}</td><td className="numeric"><strong>{fmt(row.value, result.metric === "ts" || result.metric === "efg" ? 1 : 2)}{result.metric === "ts" || result.metric === "efg" ? "%" : ""}</strong></td></tr>)}</tbody></table></div>
      {!result.rows.length && <p className="empty">No players match this ranking filter.</p>}
      <div className="pagination"><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={(page + 1) * 50 >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div>
      <p className="note" style={{ marginTop: 24 }}>Source: NCAA-derived player box release via SportsDataverse. Rankings are descriptive source statistics, not eligibility, recruiting grades or a verified identity match to ESPN records.</p>
    </>}
  </>;
}
