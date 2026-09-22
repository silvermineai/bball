"use client";

import { useEffect, useMemo, useState } from "react";
import {
  filterMensLowerRatings,
  parseMensLowerRatingsAsset,
  sortMensLowerRatings,
  type MensLowerDivision,
  type MensLowerRatingsAsset,
  type MensLowerRatingsSort,
} from "../_lib/mens-lower-division-ratings";

const formatDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "capture date unavailable" : parsed.toLocaleDateString("en-US", { timeZone: "UTC" });
};

export default function MensLowerDivisionRatings({ division }: { division: MensLowerDivision }) {
  const [asset, setAsset] = useState<MensLowerRatingsAsset | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MensLowerRatingsSort>("rank");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/basketball/mens-lower-division-ratings.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("The men's lower-division ratings could not be loaded.")))
      .then((value: unknown) => {
        if (!controller.signal.aborted) setAsset(parseMensLowerRatingsAsset(value));
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && (reason as { name?: string })?.name !== "AbortError") {
          setError(reason instanceof Error ? reason.message : "The men's lower-division ratings could not be loaded.");
        }
      });
    return () => controller.abort();
  }, []);

  const current = asset?.divisions[`d${division}`];
  const rows = useMemo(() => {
    if (!current) return [];
    const filtered = filterMensLowerRatings(current.ratings, query);
    return sortMensLowerRatings(filtered, sort, sort === "rank" ? "asc" : sort === "team" ? "asc" : "desc").slice(0, 50);
  }, [current, query, sort]);

  return (
    <section className="paper-panel" style={{ marginTop: 18 }} aria-labelledby={`mens-lower-ratings-${division}`}>
      <div className="eyebrow">MEN&apos;S BASKETBALL · D{division} RATINGS</div>
      <h3 id={`mens-lower-ratings-${division}`}>Historical strength board</h3>
      <p className="note">A separate exact-division rating fit over retained final games. This board describes the completed archive; it does not turn an empty 2026–27 schedule into a forecast.</p>
      {error ? <p className="status-error" role="alert">{error}</p> : !current ? <p className="muted" role="status">Loading the men's D{division} ratings evidence…</p> : <>
        <div className="scope-snapshot-counts">
          <strong>{current.coverage.valid_final_games.toLocaleString()}</strong><span>validated finals</span>
          <strong>{current.coverage.teams.toLocaleString()}</strong><span>source teams</span>
          <strong>{current.coverage.source_receipts.toLocaleString()}</strong><span>response receipts</span>
        </div>
        <div className="toolbar" style={{ marginTop: 16 }}>
          <label className="control"><span>SEARCH TEAM</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Team, conference, or ID" /></label>
          <label className="control"><span>SORT BY</span><select value={sort} onChange={(event) => setSort(event.target.value as MensLowerRatingsSort)}><option value="rank">Model rank</option><option value="rating">Rating</option><option value="win_pct">Win %</option><option value="avg_margin">Average margin</option><option value="team">Team</option></select></label>
        </div>
        <div className="table-scroll" style={{ marginTop: 16 }}>
          <table className="data-table"><thead><tr><th>Rank</th><th>Team</th><th className="numeric">GP</th><th className="numeric">W–L</th><th className="numeric">Win %</th><th className="numeric">Avg margin</th><th className="numeric">Rating</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.team_id}><td className="rank-number">{row.rank}</td><th scope="row">{row.team}<small>{row.team_id}{row.conference ? ` · ${row.conference}` : ""}</small></th><td className="numeric">{row.games}</td><td className="numeric"><strong>{row.wins}–{row.losses}</strong></td><td className="numeric">{(row.win_pct * 100).toFixed(1)}%</td><td className="numeric">{row.avg_margin.toFixed(1)}</td><td className="numeric">{row.rating.toFixed(1)}</td></tr>)}</tbody>
          </table>
        </div>
        {!rows.length ? <p className="empty">No D{division} teams match this search.</p> : null}
        <p className="muted">Model <code>{current.model_id}</code> · fitted on {current.fit.training_games.toLocaleString()} games from {current.fit.training_season} · captured {asset ? formatDate(asset.generated_at) : "—"} · forecasts: {current.forecast_status}.</p>
      </>}
    </section>
  );
}
