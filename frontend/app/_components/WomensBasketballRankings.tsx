"use client";

import { useEffect, useMemo, useState } from "react";
import {
  filterWomensRankingRows,
  paginateWomensRankingRows,
  womensRankingSampleLabel,
  type WomensRankingRow,
} from "../_lib/womens-rankings-view";
import { WOMENS_SOURCE_SCOPE_LABEL, WOMENS_SOURCE_SCOPE_NOTE } from "../_lib/womens-source-scope";

type RankingRow = WomensRankingRow & { position: string; games: number; value: number; sample?: number };
type Board = { label: string; stat: string; unit: string; description?: string; sample_field?: string; min_sample?: number; sample_unit?: string; rows: RankingRow[] };
type BoardArchive = {
  season?: number;
  generated_at?: string;
  coverage?: { players?: number; rows?: number; played_rows?: number };
  min_games: number;
  qualification?: { field: string; minimum: number; scope: string; schedule_reconciled: boolean; dnp_excluded?: boolean };
  coverage_by_metric: Record<string, { observed: number; qualified: number }>;
  leaderboards: Record<string, Board>;
  receipt?: { sha256?: string | null };
};
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
  box_archive?: BoardArchive;
};

const formatValue = (value: number, unit: string) => unit.endsWith("%") ? `${value.toFixed(1)}%` : value.toFixed(1);

export default function WomensBasketballRankings() {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [source, setSource] = useState<"box" | "season">("box");
  const [metric, setMetric] = useState("scoring");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    fetch("/data/basketball/womens-rankings.json")
      .then((response) => response.ok ? response.json() : null)
      .then((value: Publication | null) => setPublication(value))
      .catch(() => setPublication(null));
  }, []);

  const archive = source === "box" ? publication?.box_archive : undefined;
  const usingBox = Boolean(archive);
  const boards = archive?.leaderboards || publication?.leaderboards || {};
  const coverage = archive?.coverage_by_metric || publication?.coverage || {};
  const board = boards[metric];
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
    <div className="eyebrow">WOMEN&apos;S PLAYER RANKINGS · {WOMENS_SOURCE_SCOPE_LABEL}</div>
    <h2 id="wbb-rankings-title">Rank one stat at a time</h2>
    <p className="muted">These boards keep units separate. Choose the larger game-box cohort to include players absent from the bounded player-season release. {WOMENS_SOURCE_SCOPE_NOTE}</p>
    {!publication ? <p className="muted">Loading women&apos;s player rankings…</p> : <>
      <div className="wbb-ranking-controls">
        <label htmlFor="wbb-ranking-source">Ranking archive</label>
        <select id="wbb-ranking-source" value={source} onChange={(event) => { setSource(event.target.value as "box" | "season"); setMetric("scoring"); }}>
          {publication.box_archive ? <option value="box">Game box archive · {publication.box_archive.coverage?.players?.toLocaleString() || "all retained"} players</option> : null}
          <option value="season">Player-season release · {publication.leaderboards.scoring?.rows.length.toLocaleString() || "source rows"} qualified rows</option>
        </select>
        <label htmlFor="wbb-ranking-metric">Ranking lens</label>
        <select id="wbb-ranking-metric" value={metric} onChange={(event) => setMetric(event.target.value)}>
          {Object.entries(boards).map(([key, value]) => <option key={key} value={key}>{value.label} · {value.unit}</option>)}
        </select>
        <label htmlFor="wbb-ranking-search">Search board</label>
        <input id="wbb-ranking-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Player, team, or source ID" />
      </div>
      {board ? <>
        <p className="note">{board.description || board.label} · {coverage[metric]?.qualified.toLocaleString() || 0} qualified players · observed values {coverage[metric]?.observed.toLocaleString() || 0}{board.min_sample != null && board.sample_unit ? ` · minimum ${board.min_sample.toLocaleString()} ${board.sample_unit}` : ""}. Showing {rows.length ? `${page * 50 + 1}–${page * 50 + rows.length}` : "0"} of {matchingRows.length.toLocaleString()} matching rows. Equal values share a rank; board ranks remain global when searching.</p>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Player</th><th>Team</th><th>Pos.</th><th className="numeric">Games</th>{usingBox ? <th className="numeric">Box rows</th> : null}{board.sample_unit ? <th className="numeric">Rate sample</th> : null}<th className="numeric">{board.unit}</th></tr></thead><tbody>{rows.map((row) => <tr key={`${metric}-${row.player_id}`}><td className="rank-number">{row.rank}</td><th scope="row">{row.name}<small>{usingBox ? "Exact box player " : "Source player "}{row.player_id}</small></th><td>{row.team}</td><td>{row.position || "—"}</td><td className="numeric">{row.games.toLocaleString()}</td>{usingBox ? <td className="numeric">{(row as RankingRow & { box_rows?: number }).box_rows?.toLocaleString() || "—"}</td> : null}{board.sample_unit ? <td className="numeric">{womensRankingSampleLabel(row, board) || "—"}</td> : null}<td className="numeric"><strong>{formatValue(row.value, board.unit)}</strong></td></tr>)}</tbody></table></div>
        {!rows.length ? <p className="empty">No qualified players match this search.</p> : null}
        {matchingRows.length > 50 && <div className="pagination" aria-label="Women&apos;s player ranking pages"><span>Page {page + 1} of {Math.ceil(matchingRows.length / 50)}</span><div><button className="button secondary" type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>← Previous</button><button className="button secondary" type="button" disabled={(page + 1) * 50 >= matchingRows.length} onClick={() => setPage((current) => current + 1)}>Next →</button></div></div>}
      </> : null}
      <p className="muted">{publication.limitations[0]}</p>
      <p className="note">Qualification field: <code>{archive?.qualification?.field || publication.qualification?.field || "gamesPlayed"}</code> ({archive?.qualification?.scope || publication.qualification?.scope || "source-reported player-season field"}). Schedule reconciliation is {archive?.qualification?.schedule_reconciled || publication.qualification?.schedule_reconciled ? "included" : "not included"}{archive?.qualification?.dnp_excluded ? " · DNP rows excluded" : ""}.</p>
      {usingBox && archive?.receipt?.sha256 ? <p className="note">Game box archive receipt: <span className="source-hash">SHA-256 {archive.receipt.sha256.slice(0, 16)}…</span>{archive.generated_at ? ` · published ${archive.generated_at}` : ""}</p> : publication.receipts && <p className="note">Edition receipt: {publication.receipts.player_season?.sha256 ? <span className="source-hash">SHA-256 {publication.receipts.player_season.sha256.slice(0, 16)}…</span> : "hash unavailable"}{publication.generated_at ? ` · published ${publication.generated_at}` : ""}</p>}
    </>}
  </section>;
}
