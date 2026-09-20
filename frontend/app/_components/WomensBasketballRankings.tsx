"use client";

import { useEffect, useMemo, useState } from "react";

type RankingRow = { rank: number; player_id: string; name: string; team: string; position: string; games: number; value: number };
type Board = { label: string; stat: string; unit: string; rows: RankingRow[] };
type Publication = {
  season: number;
  min_games: number;
  qualification?: { field: string; minimum: number; scope: string; schedule_reconciled: boolean };
  coverage: Record<string, { observed: number; qualified: number }>;
  leaderboards: Record<string, Board>;
  limitations: string[];
};

const formatValue = (value: number, unit: string) => unit.endsWith("%") ? `${value.toFixed(1)}%` : value.toFixed(1);

export default function WomensBasketballRankings() {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [metric, setMetric] = useState("scoring");
  const [query, setQuery] = useState("");
  useEffect(() => {
    fetch("/data/basketball/womens-rankings.json")
      .then((response) => response.ok ? response.json() : null)
      .then((value: Publication | null) => setPublication(value))
      .catch(() => setPublication(null));
  }, []);

  const board = publication?.leaderboards[metric];
  const rows = useMemo(() => {
    if (!board) return [];
    const needle = query.trim().toLowerCase();
    return (needle ? board.rows.filter((row) => `${row.name} ${row.team} ${row.player_id}`.toLowerCase().includes(needle)) : board.rows).slice(0, 50);
  }, [board, query]);

  return <section className="field-card wbb-ranking-card" aria-labelledby="wbb-rankings-title">
    <div className="eyebrow">WOMEN&apos;S PLAYER RANKINGS · D1</div>
    <h2 id="wbb-rankings-title">Rank one stat at a time</h2>
    <p className="muted">These boards keep units separate. Players qualify when the retained record has at least {publication?.qualification?.minimum || publication?.min_games || 10} source reported games and a finite value for the selected stat.</p>
    {!publication ? <p className="muted">Loading women&apos;s player rankings…</p> : <>
      <div className="wbb-ranking-controls">
        <label htmlFor="wbb-ranking-metric">Ranking lens</label>
        <select id="wbb-ranking-metric" value={metric} onChange={(event) => setMetric(event.target.value)}>
          {Object.entries(publication.leaderboards).map(([key, value]) => <option key={key} value={key}>{value.label} · {value.unit}</option>)}
        </select>
        <label htmlFor="wbb-ranking-search">Search board</label>
        <input id="wbb-ranking-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Player, team, or source ID" />
      </div>
      {board ? <>
        <p className="note">{board.label} · {publication.coverage[metric]?.qualified.toLocaleString() || 0} qualified players · observed values {publication.coverage[metric]?.observed.toLocaleString() || 0}. Showing the first {rows.length} matching rows.</p>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Player</th><th>Team</th><th>Pos.</th><th className="numeric">Games</th><th className="numeric">{board.unit}</th></tr></thead><tbody>{rows.map((row) => <tr key={`${metric}-${row.player_id}`}><td className="rank-number">{query ? "—" : row.rank}</td><th scope="row">{row.name}<small>Source player {row.player_id}</small></th><td>{row.team}</td><td>{row.position || "—"}</td><td className="numeric">{row.games.toLocaleString()}</td><td className="numeric"><strong>{formatValue(row.value, board.unit)}</strong></td></tr>)}</tbody></table></div>
        {!rows.length ? <p className="empty">No qualified players match this search.</p> : null}
      </> : null}
      <p className="muted">{publication.limitations[0]}</p>
      <p className="note">Qualification field: <code>{publication.qualification?.field || "gamesPlayed"}</code> ({publication.qualification?.scope || "source-reported player-season field"}). Schedule reconciliation is {publication.qualification?.schedule_reconciled ? "included" : "not included"} in this release.</p>
    </>}
  </section>;
}
