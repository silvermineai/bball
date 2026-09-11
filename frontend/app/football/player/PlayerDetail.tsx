"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
  yards_per_play: number | null;
  touchdowns: number | null;
  success_rate: number | null;
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
  source_receipts?: {
    dataset: string;
    season: number;
    url: string;
    fetched_at: string;
    sha256: string;
  }[];
};
type CareerRow = {
  season: number;
  dataset: string;
  category: string;
  team_id: string | null;
  team: string;
  games: number | null;
  plays: number | null;
  yards: number | null;
  touchdowns: number | null;
  epa: number | null;
  epa_per_play: number | null;
};
type Career = {
  player_id: string;
  seasons: number[];
  source_records: number;
  box_games: Record<string, number>;
  rows: CareerRow[];
};
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const sourceLabels: Record<string, string> = {
  box: "Box-score rows",
  passing: "Passing aggregates",
  rushing: "Rushing aggregates",
  receiving: "Receiving aggregates",
  schedule: "Schedule",
  teams: "Team metadata",
  ncaa_player_stats: "NCAA leader archive",
};
export default function PlayerDetail() {
  const search = useSearchParams(),
    id = search.get("id"),
    seasonParam = search.get("season"),
    requestedSeason = seasonParam || "2025";
  const [page, setPage] = useState(0),
    [data, setData] = useState<Detail | null>(null),
    [career, setCareer] = useState<Career | null>(null),
    [activeSeason, setActiveSeason] = useState(requestedSeason),
    [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    const c = new AbortController();
    setData(null);
    setCareer(null);
    setActiveSeason(requestedSeason);
    setError("");
    const load = async () => {
      let history: Career | null = null;
      try {
        const response = await fetch(`/api/football/players/${encodeURIComponent(id)}/career`, { signal: c.signal });
        if (response.ok) history = await response.json() as Career;
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") throw e;
      }
      if (c.signal.aborted) return;
      const requested = Number(requestedSeason);
      const effective = history?.seasons.includes(requested)
        ? requested
        : history?.seasons[0] ?? requestedSeason;
      setActiveSeason(String(effective));
      const response = await fetch(
        `/api/football/players/${encodeURIComponent(id)}?season=${encodeURIComponent(effective)}&page=${page}`,
        { signal: c.signal },
      );
      if (!response.ok) {
        throw Error(
          response.status === 404
            ? "No imported records found for this player."
            : "The game log is temporarily unavailable.",
        );
      }
      const detail = await response.json() as Detail;
      if (!c.signal.aborted) {
        setData(detail);
        setCareer(history);
      }
    };
    load().catch((e: unknown) => {
      if ((e as { name?: string }).name !== "AbortError") setError((e as Error).message);
    });
    return () => c.abort();
  }, [id, requestedSeason, page]);
  return (
    <>
      <Link
        className="eyebrow"
        href={`/football/players/?season=${encodeURIComponent(activeSeason)}`}
      >
        ← Player index
      </Link>
      <div className="page-title">
        <div className="eyebrow" style={{ marginTop: 25 }}>
          Source records / {activeSeason}
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
                      <small>{fmt(item.plays, 0)} plays · {fmt(item.yards, 0)} yards · {fmt(item.yards_per_play, 2)} yards/play · {fmt(item.touchdowns, 0)} TD · {fmt(item.games, 0)} games</small>
                      <small>{item.success_rate == null ? "Success rate unavailable" : `${fmt(item.success_rate * 100, 1)}% source success rate`}</small>
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
          {career?.rows.length ? <FootballCareerPanel career={career} selectedSeason={data.season} name={data.name} /> : null}
          <section className="section paper-panel">
            <div className="section-heading">
              <h2>Source receipts.</h2>
            </div>
            <p className="note">
              Release clocks and SHA-256 hashes for the season datasets used in
              this dossier. Missing source fields stay missing in the game log.
            </p>
            {data.source_receipts?.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Dataset</th><th>Fetched</th><th>Receipt hash</th></tr></thead>
                  <tbody>{data.source_receipts.map((receipt) => (
                    <tr key={`${receipt.dataset}-${receipt.season}`}>
                      <td><a href={receipt.url} target="_blank" rel="noreferrer">{sourceLabels[receipt.dataset] || receipt.dataset} ↗</a></td>
                      <td>{receipt.fetched_at}</td>
                      <td><code>{receipt.sha256}</code></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="empty">No source receipts are available for this season.</p>}
          </section>
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

function FootballCareerPanel({
  career,
  selectedSeason,
  name,
}: {
  career: Career;
  selectedSeason: number;
  name: string;
}) {
  const seasons = useMemo(() => {
    const grouped = new Map<number, CareerRow[]>();
    for (const row of career.rows) {
      grouped.set(row.season, [...(grouped.get(row.season) || []), row]);
    }
    return [...grouped.entries()].sort(([a], [b]) => b - a);
  }, [career.rows]);
  const latest = seasons[0]?.[1] || [];
  const prior = seasons[1]?.[1] || [];
  const seasonEpa = (rows: CareerRow[]) => {
    const values = rows.map((row) => row.epa).filter((value): value is number => value != null && Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const latestEpa = seasonEpa(latest);
  const priorEpa = seasonEpa(prior);
  const epaDelta = latestEpa != null && priorEpa != null ? latestEpa - priorEpa : null;
  const latestPlays = latest.reduce((sum, row) => sum + (row.plays ?? 0), 0);
  const boxGames = Object.values(career.box_games).reduce((sum, games) => sum + games, 0);
  return (
    <section className="section paper-panel football-career-panel" aria-labelledby="football-career-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Development / exact athlete ID</div>
          <h2 id="football-career-title">See the production move.</h2>
        </div>
        <Link className="hero-link" href={`/football/careers/?q=${encodeURIComponent(name)}`}>Open career index →</Link>
      </div>
      <p className="note">
        {career.seasons.length} source seasons · {career.source_records.toLocaleString()} category records · {boxGames.toLocaleString()} box-score games. Category totals stay separate; this panel never adds passing, rushing and receiving EPA into one grade.
      </p>
      <div className="strip" style={{ marginTop: 18 }}>
        <div><strong>{latestEpa == null ? "—" : fmt(latestEpa)}</strong><span>Latest season EPA · source categories</span></div>
        <div><strong>{epaDelta == null ? "—" : `${epaDelta >= 0 ? "+" : ""}${fmt(epaDelta)}`}</strong><span>Change vs prior source season</span></div>
        <div><strong>{latestPlays ? latestPlays.toLocaleString() : "—"}</strong><span>Latest recorded plays</span></div>
        <div><strong>{career.seasons.length}</strong><span>Seasons with attributed production</span></div>
      </div>
      <div className="table-scroll" style={{ marginTop: 18 }}>
        <table className="data-table">
          <thead><tr><th>Season / team</th><th>Category</th><th className="numeric">Games</th><th className="numeric">Plays</th><th className="numeric">Yards</th><th className="numeric">TD</th><th className="numeric">EPA</th><th className="numeric">EPA / play</th></tr></thead>
          <tbody>
            {seasons.flatMap(([, rows]) => rows).map((row) => (
              <tr key={`${row.season}-${row.dataset}-${row.team_id || "unknown"}-${row.category}`} className={row.season === selectedSeason ? "career-selected-row" : ""}>
                <td><strong>{row.season}</strong><small>{row.team} · {row.team_id || "team ID unavailable"}</small></td>
                <td>{label(row.category)}<small>{row.dataset} source aggregate</small></td>
                <td className="numeric">{fmt(row.games, 0)}</td>
                <td className="numeric">{fmt(row.plays, 0)}</td>
                <td className="numeric">{fmt(row.yards, 0)}</td>
                <td className="numeric">{fmt(row.touchdowns, 0)}</td>
                <td className="numeric">{fmt(row.epa)}</td>
                <td className="numeric">{fmt(row.epa_per_play, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">The selected season is highlighted. Values are source-attributed aggregates for this athlete ID and team-season; no transfer, eligibility, role or future performance claim is inferred.</p>
    </section>
  );
}
