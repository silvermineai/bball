"use client";

import { useEffect, useState } from "react";

type Row = Record<string, string | number | null | undefined> & { raw?: Record<string, unknown> };
type Result = { total: number; rows: Row[]; source?: { url?: string; fetched_at?: string } | null };

export default function GameContext() {
  const [view, setView] = useState<"rosters" | "officials">("rosters");
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    fetch(`/api/basketball/research/ncaa-game-context?view=${view}&season=2026`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The game context archive could not be loaded."); return response.json() as Promise<Result>; })
      .then(setData).catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, [view]);
  return <main className="archive-page">
    <div className="page-title"><div className="eyebrow">ESPN source archive / game context</div><h1>Know who<br /><em>actually played.</em></h1><p>Game-day roster and officiating releases add the context a box score cannot: who was active, who started, who sat, and which officials worked the game. Every row keeps its source payload for audit.</p></div>
    <div className="strip"><div><strong>{data?.total.toLocaleString() ?? "—"}</strong><span>{view === "rosters" ? "Roster rows" : "Official assignments"}</span></div><div><strong>2025–26</strong><span>Source edition</span></div><div><strong>ESPN</strong><span>Upstream via SportsDataverse</span></div></div>
    <div className="button-row" style={{ marginTop: 24 }}><button className={`button ${view === "rosters" ? "" : "secondary"}`} onClick={() => setView("rosters")}>Game rosters</button><button className={`button ${view === "officials" ? "" : "secondary"}`} onClick={() => setView("officials")}>Officials</button></div>
    {error ? <div className="status-error" role="alert">{error}</div> : !data ? <p className="empty">Loading source rows…</p> : <section className="note" style={{ marginTop: 24 }}><div className="section-heading"><div><div className="eyebrow">2025–26 retained rows</div><h2>{data.total.toLocaleString()} source records</h2></div>{data.source?.url ? <a href={data.source.url} target="_blank" rel="noreferrer">Open release ↗</a> : null}</div><div className="table-scroll" style={{ marginTop: 16 }}><table className="data-table"><thead><tr>{view === "rosters" ? <><th>Game</th><th>Program</th><th>Player</th><th>Role</th><th>Status</th></> : <><th>Game</th><th>Order</th><th>Official</th><th>Position</th></>}</tr></thead><tbody>{data.rows.map((row, index) => <tr key={`${row.game_id}-${row.athlete_id ?? row.official_order}-${index}`}>{view === "rosters" ? <><td><code>{row.game_id}</code></td><td>{row.team_name ?? row.team_id}</td><td><strong>{row.athlete_name ?? row.athlete_id}</strong></td><td>{row.starter ? "Starter" : "Bench"}</td><td>{row.did_not_play ? String(row.reason || "DNP") : row.active ? "Active" : "Inactive"}</td></> : <><td><code>{row.game_id}</code></td><td>{row.official_order}</td><td><strong>{row.official_name}</strong></td><td>{row.official_position}</td></>}</tr>)}</tbody></table></div><p style={{ marginTop: 16 }}>Retrieved {data.source?.fetched_at ? new Date(data.source.fetched_at).toLocaleString() : "date unavailable"}. Source fields are descriptive evidence; they do not establish eligibility or a recruiting commitment.</p></section>}
  </main>;
}
