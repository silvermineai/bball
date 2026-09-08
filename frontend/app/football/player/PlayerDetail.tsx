"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { date, fmt } from "../../_lib/format";
type Row = {
  dataset: string;
  game_id: string | null;
  category: string;
  stats: Record<string, string>;
  kickoff: string | null;
  home_name: string | null;
  away_name: string | null;
};
type Production = {
  category: string;
  team_id: string | null;
  team: string;
  division: string;
  games: number | null;
  plays: number | null;
  yards: number | null;
  touchdowns: number | null;
  epa: number | null;
  epa_per_play: number | null;
  rank: number | null;
};
type Detail = {
  rows: Row[];
  total: number;
  name: string;
  season: number;
  summary?: {
    production: Production[];
    box_categories: { category: string; records: number; games: number }[];
  };
};
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
export default function PlayerDetail() {
  const search = useSearchParams(),
    id = search.get("id"),
    season = search.get("season") || "2025";
  const [page, setPage] = useState(0),
    [data, setData] = useState<Detail | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    const c = new AbortController();
    setData(null);
    setError("");
    fetch(
      `/api/football/players/${encodeURIComponent(id)}?season=${encodeURIComponent(season)}&page=${page}`,
      { signal: c.signal },
    )
      .then((r) => {
        if (!r.ok)
          throw Error(
            r.status === 404
              ? "No imported records found for this player."
              : "The game log is temporarily unavailable.",
          );
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [id, season, page]);
  return (
    <>
      <Link
        className="eyebrow"
        href={`/football/players/?season=${encodeURIComponent(season)}`}
      >
        ← Player index
      </Link>
      <div className="page-title">
        <div className="eyebrow" style={{ marginTop: 25 }}>
          Source records / {season}
        </div>
        <h1>{data?.name || "Player game log"}</h1>
        <p>
          Every imported box-score category for this player, plus available
          season production. Source field names are retained; generic “stat”
          columns have no confirmed label and are shown without interpretation.
        </p>
      </div>
      {!id ? (
        <p className="empty">Select a player from the player index.</p>
      ) : error ? (
        <p role="alert" className="status-error">
          {error}
        </p>
      ) : !data ? (
        <p role="status" className="empty">
          Loading records from Cloudflare D1…
        </p>
      ) : (
        <>
          {data.summary && (
            <section className="section paper-panel" aria-labelledby="football-player-summary">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">Season production / exact athlete ID</div>
                  <h2 id="football-player-summary">The numbers behind the rank.</h2>
                </div>
                <span className="note">{data.season} source edition</span>
              </div>
              {data.summary.production.length ? (
                <div className="raw-stat-grid">
                  {data.summary.production.map((item) => (
                    <div key={`${item.category}-${item.team_id || "unknown"}`}>
                      <dt>{label(item.category)} · {item.team || "Team unavailable"}</dt>
                      <dd>{fmt(item.epa)} EPA · {fmt(item.epa_per_play, 2)} / play</dd>
                      <small>{fmt(item.plays, 0)} plays · {fmt(item.yards, 0)} yards · {fmt(item.touchdowns, 0)} TD · {fmt(item.games, 0)} games</small>
                      <small>{item.rank == null ? "Unranked in this source category" : `EPA rank ${item.rank.toLocaleString()}`}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">No season EPA aggregate is published for this player. The game log below retains the available source categories.</p>
              )}
              {data.summary.box_categories.length > 0 && (
                <p className="note" style={{ marginTop: 16 }}>
                  Additional box-score coverage: {data.summary.box_categories.map((item) => `${label(item.category)} (${item.games} ${item.games === 1 ? "game" : "games"})`).join(" · ")}. These categories remain source rows and are not folded into the EPA ranking.
                </p>
              )}
              <p className="note" style={{ marginTop: 10 }}>
                EPA totals and ranks are publisher aggregates for this exact athlete/team-season record. Passing, rushing and receiving totals describe separate source categories and must not be added together.
              </p>
            </section>
          )}
          <p className="note">
            {data.total} records · SportsDataverse release imports ·{" "}
            {data.season}
          </p>
          {data.rows.map((row, i) => (
            <details key={`${page}-${i}`} open={i === 0}>
              <summary>
                {row.kickoff ? date(row.kickoff) : "Season aggregate"} ·{" "}
                {row.category}{" "}
                {row.home_name ? `· ${row.away_name} at ${row.home_name}` : ""}
              </summary>
              <dl className="raw-stat-grid">
                {Object.entries(row.stats)
                  .filter(
                    ([k]) =>
                      ![
                        "athlete_name",
                        "athlete_id",
                        "game_id",
                        "season",
                        "team_id",
                        "player_id",
                      ].includes(k),
                  )
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k.startsWith("stat_") ? `${k} (unmapped)` : k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
            </details>
          ))}
          <div className="pagination">
            <span>
              Page {page + 1} of {Math.max(1, Math.ceil(data.total / 50))}
            </span>
            <div>
              <button
                className="button secondary"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                ← Previous
              </button>
              <button
                className="button secondary"
                disabled={(page + 1) * 50 >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
