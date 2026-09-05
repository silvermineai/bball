"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { date } from "../../_lib/format";
type Row = {
  dataset: string;
  game_id: string | null;
  category: string;
  stats: Record<string, string>;
  kickoff: string | null;
  home_name: string | null;
  away_name: string | null;
};
type Detail = { rows: Row[]; total: number; name: string; season: number };
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
