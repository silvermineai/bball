"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv, toCsv } from "../../_lib/csv";

type Row = {
  season: number; contest_id: string; team_id: string; player_id: string;
  game_date: string | null; team_name: string | null; opponent_name: string | null;
  player_name: string | null; stats: Record<string, number | null>;
};
type Result = { season: number; archive_mode: "games" | "season"; page: number; page_size: number; total: number; rows: Row[] };
type Meta = { seasons: number[]; total: number };
const label = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const n = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);
const pct = (value: number | null | undefined) => n(value == null ? null : value * 100) + "%";
const rate = (made: number | null | undefined, attempted: number | null | undefined) => attempted ? (made || 0) / attempted : null;

export default function NcaaPlayerBox() {
  const initial = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const [season, setSeason] = useState(initial?.get("season") || "2026");
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
    const params = new URLSearchParams({ season });
    if (query.trim()) params.set("q", query.trim());
    if (page) params.set("page", String(page));
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [season, query, page]);

  useEffect(() => {
    fetch(`/api/basketball/research/ncaa-player-box?meta=1&season=${season}`)
      .then((r) => { if (!r.ok) throw Error("The NCAA player archive could not be loaded."); return r.json() as Promise<Meta>; })
      .then(setMeta).catch((e) => setError(e.message));
  }, [season]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ season, page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    setResult(null);
    fetch(`/api/basketball/research/ncaa-player-box?${params}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw Error("The NCAA player archive could not be loaded."); return r.json() as Promise<Result>; })
      .then((value) => { if (!controller.signal.aborted) setResult(value); })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [season, query, page]);

  const pages = useMemo(() => Math.max(1, Math.ceil((result?.total || 0) / 50)), [result]);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Archive link copied.");
    } catch {
      setCopied("Copy the archive URL from your address bar.");
    }
  };
  const download = () => {
    if (!result) return;
    downloadCsv(
      `ncaa-player-box-${season}-${result.archive_mode}-page-${page + 1}.csv`,
      toCsv(
        ["Season", "Archive mode", "Game date", "Contest ID", "Player", "NCAA player ID", "Team", "NCAA team ID", "Opponent", "Minutes", "Points", "Rebounds", "Assists", "FGM", "FGA", "3PM", "3PA", "FTM", "FTA", "True shooting %", "Raw source stats JSON"],
        result.rows.map((row) => {
          const s = row.stats;
          return [result.season, result.archive_mode, row.game_date, row.contest_id, row.player_name, row.player_id, row.team_name, row.team_id, row.opponent_name, s.mins, s.pts, (s.orb || 0) + (s.drb || 0), s.ast, s.fgm, s.fga, s.tpm, s.tpa, s.ftm, s.fta, s.ts_pct == null ? rate(s.pts, 2 * ((s.fga || 0) + 0.475 * (s.fta || 0))) == null ? null : rate(s.pts, 2 * ((s.fga || 0) + 0.475 * (s.fta || 0)))! * 100 : s.ts_pct * 100, JSON.stringify(s)];
        }),
      ),
    );
  };
  return <>
    <div className="page-title">
      <div className="eyebrow">NCAA source archive / player box scores</div>
      <h1>See the whole<br /><em>stat line.</em></h1>
      <p>Game-level NCAA-derived player production with shooting zones, transition splits and playmaking context. Source IDs stay separate from ESPN identities until an audited crosswalk exists.</p>
    </div>
    <div className="strip">
      <div><strong>{result?.total.toLocaleString() ?? meta?.total.toLocaleString() ?? "—"}</strong><span>Rows in selected season</span></div>
      <div><strong>{meta?.seasons.length ?? "—"}</strong><span>Source seasons</span></div>
      <div><strong>50</strong><span>Rows per page</span></div>
      <div><strong>NCAA</strong><span>Identity namespace</span></div>
    </div>
    <div className="toolbar">
      <label className="control"><span>SEASON</span><select value={season} onChange={(e) => { setSeason(e.target.value); setPage(0); }}>{(meta?.seasons || [2026]).map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
      <label className="control"><span>PLAYER, TEAM OR ID</span><input type="search" maxLength={120} placeholder="Search a player, team or source ID" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
    </div>
    {error ? <p className="status-error" role="alert">{error}</p> : !result ? <p className="empty" role="status">Loading NCAA player rows…</p> : <>
      <div className="section-heading" style={{ marginBottom: 20 }}><p>{result.total.toLocaleString()} matching {result.archive_mode === "games" ? "game rows" : "season summaries"} · page {page + 1} of {pages} · points, minutes, rebounds, assists and shooting splits come from the source release.</p><div className="button-row"><button className="button secondary" type="button" onClick={download}>Download page CSV ↓</button><button className="button secondary" type="button" onClick={share}>Copy archive link</button></div></div>
      {copied && <p role="status">{copied}</p>}
      <div className="table-scroll"><table className="data-table"><thead><tr><th>{result.archive_mode === "games" ? "Date / player" : "Season / player"}</th><th>{result.archive_mode === "games" ? "Matchup" : "Program"}</th><th className="numeric">MIN</th><th className="numeric">PTS</th><th className="numeric">REB</th><th className="numeric">AST</th><th className="numeric">FG</th><th className="numeric">3P</th><th className="numeric">TS%</th></tr></thead><tbody>{result.rows.map((row) => { const s = row.stats; return <tr key={`${row.contest_id || row.season}-${row.team_id}-${row.player_id}`}><td><strong>{row.player_name || row.player_id}</strong><small>{result.archive_mode === "games" ? `${row.game_date || "—"} ·` : `${label(row.season)} ·`} NCAA player {row.player_id}</small><small><a href={`https://stats.ncaa.org/players/${encodeURIComponent(row.player_id)}`} target="_blank" rel="noreferrer">NCAA source ↗</a></small></td><td><strong>{row.team_name || row.team_id}</strong><small>{result.archive_mode === "games" ? `vs ${row.opponent_name || "—"} · contest ${row.contest_id}` : `NCAA team ${row.team_id}`}</small></td><td className="numeric">{n(s.mins)}</td><td className="numeric"><strong>{n(s.pts, 0)}</strong></td><td className="numeric">{n((s.orb || 0) + (s.drb || 0), 0)}</td><td className="numeric">{n(s.ast, 0)}</td><td className="numeric">{pct(s.fg_pct ?? rate(s.fgm, s.fga))}</td><td className="numeric">{pct(s.tp_pct ?? rate(s.tpm, s.tpa))}</td><td className="numeric">{pct(s.ts_pct ?? rate(s.pts, 2 * ((s.fga || 0) + 0.475 * (s.fta || 0))))}</td></tr>; })}</tbody></table></div>
      {!result.rows.length && <p className="empty">No NCAA player rows match this search.</p>}
      <div className="pagination"><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={(page + 1) * 50 >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div>
      <p className="note" style={{ marginTop: 24 }}>Source: NCAA-derived player box release via SportsDataverse. This archive is descriptive and does not assert eligibility, roster status or a verified identity match to ESPN records.</p>
    </>}
  </>;
}
