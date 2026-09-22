"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv, toCsv, type CsvCell } from "../_lib/csv";
import {
  filterWomensLowerRatings,
  parseWomensLowerRatingsAsset,
  sortWomensLowerRatings,
  type WomensLowerDivision,
  type WomensLowerRatingsAsset,
  type WomensLowerRatingsSort,
} from "../_lib/womens-lower-division-ratings";

const PAGE_SIZE = 50;

const formatDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "capture date unavailable" : parsed.toLocaleDateString("en-US", { timeZone: "UTC" });
};

export default function WomensLowerDivisionRatings({ division }: { division: WomensLowerDivision }) {
  const [asset, setAsset] = useState<WomensLowerRatingsAsset | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<WomensLowerRatingsSort>("rank");
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/basketball/womens-lower-division-ratings.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("The women's lower-division ratings could not be loaded.")))
      .then((value: unknown) => {
        if (!controller.signal.aborted) setAsset(parseWomensLowerRatingsAsset(value));
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && (reason as { name?: string })?.name !== "AbortError") {
          setError(reason instanceof Error ? reason.message : "The women's lower-division ratings could not be loaded.");
        }
      });
    return () => controller.abort();
  }, []);

  const current = asset?.divisions[`d${division}`];
  const rows = useMemo(() => {
    if (!current) return [];
    const filtered = filterWomensLowerRatings(current.ratings, query);
    return sortWomensLowerRatings(filtered, sort, sort === "rank" ? "asc" : sort === "team" ? "asc" : "desc");
  }, [current, query, sort]);
  const visibleRows = useMemo(() => rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [rows, page]);
  useEffect(() => setPage(0), [division, query, sort]);

  const download = () => {
    if (!current) return;
    const headers = ["Rank", "Division", "Team", "Source team ID", "Conference", "GP", "W", "L", "Win %", "Average margin", "Rating"];
    const exportRows: CsvCell[][] = rows.map((row) => [
      row.rank,
      `D${division}`,
      row.team,
      row.team_id,
      row.conference || null,
      row.games,
      row.wins,
      row.losses,
      row.win_pct,
      row.avg_margin,
      row.rating,
    ]);
    downloadCsv(`womens-d${division}-ratings.csv`, toCsv(headers, exportRows));
  };

  return (
    <section id="wbb-lower-ratings" className="paper-panel" style={{ marginTop: 18 }} aria-labelledby={`womens-lower-ratings-${division}`}>
      <div className="eyebrow">WOMEN&apos;S BASKETBALL · D{division} RATINGS</div>
      <h3 id={`womens-lower-ratings-${division}`}>Historical strength board</h3>
      <p className="note">A separate exact-division rating fit over retained final games. This board describes the completed archive; it does not turn an empty 2026–27 schedule into a forecast.</p>
      {error ? <p className="status-error" role="alert">{error}</p> : !current ? <p className="muted" role="status">Loading women&apos;s D{division} ratings evidence…</p> : <>
        <div className="scope-snapshot-counts">
          <strong>{current.coverage.valid_final_games.toLocaleString()}</strong><span>validated finals</span>
          <strong>{current.coverage.teams.toLocaleString()}</strong><span>source teams</span>
          <strong>{current.coverage.source_receipts.toLocaleString()}</strong><span>response receipts</span>
        </div>
        <div className="table-scroll" style={{ marginTop: 16 }}><table className="data-table"><thead><tr><th>Gate</th><th>Status</th><th>Evidence</th></tr></thead><tbody>
          {current.readiness.map((check) => <tr key={check.key}><th scope="row">{check.key.replaceAll("_", " ")}</th><td><span className={`readiness-state readiness-state-${check.status === "ready" || check.status === "retrospective_only" ? "ready" : "missing"}`}>{check.status === "retrospective_only" ? "Retrospective only" : check.status === "ready" ? "Ready" : "Blocked"}</span></td><td>{check.detail}</td></tr>)}
        </tbody></table></div>
        <p className="muted">Backtest: {current.backtest.status === "retrospective_only" ? `${current.backtest.evaluated_games?.toLocaleString() || 0} holdout games · ${((current.backtest.winner_accuracy || 0) * 100).toFixed(1)}% winner accuracy · ${current.backtest.margin_mae?.toFixed(2) || "—"} point margin MAE · ${formatDate(current.backtest.holdout_start || "") }–${formatDate(current.backtest.holdout_end || "")}` : current.backtest.reason || "Unavailable"}. Target-season schedule: {current.target_schedule.status}; forecasts: {current.forecast_status}.</p>
        <div className="toolbar" style={{ marginTop: 16 }}>
          <label className="control"><span>SEARCH TEAM</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Team, conference, or ID" /></label>
          <label className="control"><span>SORT BY</span><select value={sort} onChange={(event) => setSort(event.target.value as WomensLowerRatingsSort)}><option value="rank">Model rank</option><option value="rating">Rating</option><option value="win_pct">Win %</option><option value="avg_margin">Average margin</option><option value="team">Team</option></select></label>
          <button className="button secondary" type="button" onClick={download} disabled={!rows.length}>Download filtered CSV ↓</button>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>Showing {visibleRows.length ? `${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + visibleRows.length}` : "0"} of {rows.length.toLocaleString()} matching source teams · full export respects the search and sort above.</p>
        <div className="table-scroll" style={{ marginTop: 16 }}>
          <table className="data-table"><thead><tr><th>Rank</th><th>Team</th><th className="numeric">GP</th><th className="numeric">W–L</th><th className="numeric">Win %</th><th className="numeric">Avg margin</th><th className="numeric">Rating</th></tr></thead>
            <tbody>{visibleRows.map((row) => <tr key={row.team_id}><td className="rank-number">{row.rank}</td><th scope="row">{row.team}<small>{row.team_id}{row.conference ? ` · ${row.conference}` : ""}</small></th><td className="numeric">{row.games}</td><td className="numeric"><strong>{row.wins}–{row.losses}</strong></td><td className="numeric">{(row.win_pct * 100).toFixed(1)}%</td><td className="numeric">{row.avg_margin.toFixed(1)}</td><td className="numeric">{row.rating.toFixed(1)}</td></tr>)}</tbody>
          </table>
        </div>
        {!visibleRows.length ? <p className="empty">No women&apos;s D{division} teams match this search.</p> : null}
        {rows.length > PAGE_SIZE ? <div className="pagination" aria-label={`Women’s D${division} rating pages`}><span>Page {page + 1} of {Math.ceil(rows.length / PAGE_SIZE)}</span><div><button className="button secondary" type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>← Previous</button><button className="button secondary" type="button" disabled={(page + 1) * PAGE_SIZE >= rows.length} onClick={() => setPage((value) => value + 1)}>Next →</button></div></div> : null}
        <p className="muted">Model <code>{current.model_id}</code> · fitted on {current.fit.training_games.toLocaleString()} games from {current.fit.training_season} · captured {formatDate(asset.generated_at)} · target schedule: {current.target_schedule.status} ({current.target_schedule.games.toLocaleString()} games) · forecasts: {current.forecast_status}.</p>
        <details style={{ marginTop: 14 }}><summary>Show source and model limits</summary><p className="note">Schedule asset SHA-256: <code>{current.source.schedule_asset_sha256 || "—"}</code><br />Receipt digest: <code>{current.source.receipt_digest}</code><br />{current.target_schedule.note}</p><ul className="plain-list">{current.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></details>
      </>}
    </section>
  );
}
