"use client";

import { useEffect, useMemo, useState } from "react";
import { parseWomensLowerDivisionEdition, type WomensLowerDivisionEdition, type WomensLowerDivisionStatistic } from "../_lib/womens-lower-division-integrity";
import { womensLowerRankingRows, womensLowerRankingValueLabel } from "../_lib/womens-lower-division-rankings";

const PAGE_SIZE = 50;
const display = (value: string | number | null) => value == null || value === "" ? "—" : String(value);

export default function WomensLowerDivisionRankings({ division }: { division: "2" | "3" }) {
  const [edition, setEdition] = useState<WomensLowerDivisionEdition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statistic, setStatistic] = useState("");
  const [query, setQuery] = useState("");
  const [minimumGames, setMinimumGames] = useState("0");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/basketball/womens-lower-division-stats.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Women’s lower-division rankings are unavailable.")))
      .then((value: unknown) => {
        if (controller.signal.aborted) return;
        try {
          setEdition(parseWomensLowerDivisionEdition(value));
          setError(null);
        } catch (reason) {
          setEdition(null);
          setError(reason instanceof Error ? reason.message : "The lower-division release failed integrity validation.");
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Women’s lower-division rankings are unavailable.");
      });
    return () => controller.abort();
  }, []);

  const current = edition?.divisions?.[division];
  const selected = current?.individual.find((item) => item.statistic === statistic) || current?.individual[0];
  const rows = useMemo(
    () => selected ? womensLowerRankingRows(selected, query, Number(minimumGames) || 0) : [],
    [selected, query, minimumGames],
  );
  useEffect(() => {
    if (current?.individual.length && !current.individual.some((item) => item.statistic === statistic)) setStatistic(current.individual[0].statistic);
  }, [current, statistic]);
  useEffect(() => setPage(0), [division, statistic, query, minimumGames]);
  const visibleRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return <section id="wbb-lower-ranking" className="field-card womens-lower-ranking-card" aria-labelledby="womens-lower-ranking-title">
    <div className="eyebrow">SOURCE-NATIVE RANKINGS · WOMEN&apos;S D{division}</div>
    <h2 id="womens-lower-ranking-title">Rank players within Division {division}</h2>
    {!edition || !current ? <p className={error ? "status-error" : "muted"} role={error ? "alert" : "status"}>{error || "Loading the receipt-backed leaderboard…"}</p> : <>
      <p className="note">Each board is the publisher&apos;s exact statistic and source rank. Rows repeat across separate leaderboards, so this desk does not merge names into an invented composite ranking or stable athlete ID. Snapshot through {current.through_games || "date unavailable"}.</p>
      <div className="division-player-controls">
        <label htmlFor="wbb-lower-ranking-stat">STATISTIC</label>
        <select id="wbb-lower-ranking-stat" value={selected?.statistic || ""} onChange={(event) => setStatistic(event.target.value)}>{current.individual.map((item) => <option key={item.statistic} value={item.statistic}>{item.label}</option>)}</select>
        <label htmlFor="wbb-lower-ranking-search">SEARCH PLAYERS</label>
        <input id="wbb-lower-ranking-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Player, team, or position" />
        <label htmlFor="wbb-lower-ranking-min-games">MINIMUM GAMES</label>
        <select id="wbb-lower-ranking-min-games" value={minimumGames} onChange={(event) => setMinimumGames(event.target.value)}><option value="0">Any recorded games</option><option value="5">5+</option><option value="10">10+</option><option value="20">20+</option></select>
      </div>
      <p className="note">Showing {visibleRows.length ? `${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + visibleRows.length}` : "0"} of {rows.length.toLocaleString()} matching source rows · value field <code>{selected ? womensLowerRankingValueLabel(selected) : "—"}</code> · {edition.receipts.length.toLocaleString()} receipt-backed responses.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Source rank</th><th>Player</th><th>Team</th><th>Pos.</th><th className="numeric">Games</th><th className="numeric">{selected ? womensLowerRankingValueLabel(selected) : "Value"}</th><th>Team source path</th></tr></thead><tbody>{visibleRows.map((row, index) => <tr key={`${selected?.statistic}-${row.rank ?? "na"}-${row.name}-${row.team}-${index}`}><td className="rank-number">{row.rank == null ? "—" : `#${row.rank}`}</td><th scope="row">{row.name || "Name unavailable"}<small>{row.position || "Position unavailable"}</small></th><td>{row.team || "Team unavailable"}</td><td>{row.position || "—"}</td><td className="numeric">{display(row.games)}</td><td className="numeric"><strong>{display(row.value)}</strong></td><td><code>{row.teamSourcePath || "unavailable"}</code></td></tr>)}</tbody></table></div>
      {!visibleRows.length ? <p className="empty">No source rows match this search and threshold.</p> : null}
      {rows.length > PAGE_SIZE ? <div className="pagination" aria-label={`Women’s D${division} ranking pages`}><span>Page {page + 1} of {Math.ceil(rows.length / PAGE_SIZE)}</span><div><button className="button secondary" type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>← Previous</button><button className="button secondary" type="button" disabled={(page + 1) * PAGE_SIZE >= rows.length} onClick={() => setPage((value) => value + 1)}>Next →</button></div></div> : null}
      <p className="muted">Source rows retain the original fields and exact team path. Missing values remain unavailable; no identity or cross-division substitution is performed.</p>
    </>}
  </section>;
}
