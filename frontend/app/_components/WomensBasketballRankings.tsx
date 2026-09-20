"use client";

import { useEffect, useMemo, useState } from "react";
import {
  filterWomensRankingRows,
  paginateWomensRankingRows,
  type WomensRankingRow,
} from "../_lib/womens-rankings-view";

type RankingRow = WomensRankingRow & { position: string; games: number; value: number };
type Board = { label: string; stat: string; unit: string; rows: RankingRow[] };
type Publication = {
  season: number;
  min_games: number;
  qualification?: { field: string; minimum: number; scope: string; schedule_reconciled: boolean };
  coverage: Record<string, { observed: number; qualified: number }>;
  leaderboards: Record<string, Board>;
  limitations: string[];
  generated_at?: string;
  source_edition_generated_at?: string;
  receipts?: Record<string, { sha256?: string | null }>;
};

const formatValue = (value: number, unit: string) => unit.endsWith("%") ? `${value.toFixed(1)}%` : value.toFixed(1);

export default function WomensBasketballRankings() {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [metric, setMetric] = useState("scoring");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    fetch("/data/basketball/womens-rankings.json")
      .then((response) => response.ok ? response.json() : null)
      .then((value: Publication | null) => setPublication(value))
      .catch(() => setPublication(null));
  }, []);

  const board = publication?.leaderboards[metric];
  const matchingRows = useMemo(
    () => board ? filterWomensRankingRows(board.rows, query) : [],
    [board, query],
  );
  const rows = useMemo(
    () => paginateWomensRankingRows(matchingRows, page),
    [matchingRows, page],
  );
  useEffect(() => setPage(0), [metric, query]);

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
        <p className="note">{board.label} · {publication.coverage[metric]?.qualified.toLocaleString() || 0} qualified players · observed values {publication.coverage[metric]?.observed.toLocaleString() || 0}. Showing {rows.length ? `${page * 50 + 1}–${page * 50 + rows.length}` : "0"} of {matchingRows.length.toLocaleString()} matching rows. Board ranks remain global when searching.</p>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Player</th><th>Team</th><th>Pos.</th><th className="numeric">Games</th><th className="numeric">{board.unit}</th></tr></thead><tbody>{rows.map((row) => <tr key={`${metric}-${row.player_id}`}><td className="rank-number">{row.rank}</td><th scope="row">{row.name}<small>Source player {row.player_id}</small></th><td>{row.team}</td><td>{row.position || "—"}</td><td className="numeric">{row.games.toLocaleString()}</td><td className="numeric"><strong>{formatValue(row.value, board.unit)}</strong></td></tr>)}</tbody></table></div>
        {!rows.length ? <p className="empty">No qualified players match this search.</p> : null}
        {matchingRows.length > 50 && <div className="pagination" aria-label="Women&apos;s player ranking pages"><span>Page {page + 1} of {Math.ceil(matchingRows.length / 50)}</span><div><button className="button secondary" type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>← Previous</button><button className="button secondary" type="button" disabled={(page + 1) * 50 >= matchingRows.length} onClick={() => setPage((current) => current + 1)}>Next →</button></div></div>}
      </> : null}
      <p className="muted">{publication.limitations[0]}</p>
      <p className="note">Qualification field: <code>{publication.qualification?.field || "gamesPlayed"}</code> ({publication.qualification?.scope || "source-reported player-season field"}). Schedule reconciliation is {publication.qualification?.schedule_reconciled ? "included" : "not included"} in this release.</p>
      {publication.receipts && <p className="note">Edition receipt: {publication.receipts.player_season?.sha256 ? <span className="source-hash">SHA-256 {publication.receipts.player_season.sha256.slice(0, 16)}…</span> : "hash unavailable"}{publication.generated_at ? ` · published ${publication.generated_at}` : ""}</p>}
    </>}
  </section>;
}
