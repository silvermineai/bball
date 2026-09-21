"use client";

import { useEffect, useMemo, useState } from "react";
import {
  filterWomensSourceTeams,
  formatWomensTeamStat,
  womensTeamMetricValue,
  womensTeamMetrics,
  type WomensSourceTeam,
} from "../_lib/womens-team-table";

type Team = { rank: number; team_id: string; team: string; rating: number; points: number; allowed: number; games: number };
type Publication = { target_season: number; coverage: { rated_teams: number }; team_ratings: Team[] };
type Edition = {
  observed_player_season: number;
  generated_at: string;
  coverage: { team_stats_teams: number; team_stats_fields: number };
  team_stats: WomensSourceTeam[];
};

export default function WomensBasketballTeams() {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"ratings" | "source">("ratings");
  const [sourceMetric, setSourceMetric] = useState("avgPoints");
  const [minimumGames, setMinimumGames] = useState("0");
  useEffect(() => {
    Promise.all([
      fetch("/data/basketball/womens-forecast.json").then((response) => response.ok ? response.json() : null),
      fetch("/data/basketball/womens-edition.json").then((response) => response.ok ? response.json() : null),
    ])
      .then(([forecast, source]) => {
        setPublication(forecast as Publication | null);
        setEdition(source as Edition | null);
      })
      .catch(() => {
        setPublication(null);
        setEdition(null);
      });
  }, []);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (publication?.team_ratings || []).filter((row) => !needle || `${row.team} ${row.team_id}`.toLowerCase().includes(needle)).slice(0, 50);
  }, [publication, query]);
  const sourceMetrics = useMemo(() => womensTeamMetrics(edition?.team_stats || []), [edition]);
  const selectedSourceMetric = sourceMetrics.find((metric) => metric.key === sourceMetric) || sourceMetrics.find((metric) => metric.key === "avgPoints") || sourceMetrics[0];
  const sourceRows = useMemo(
    () => filterWomensSourceTeams(edition?.team_stats || [], query, selectedSourceMetric?.key || "", Number(minimumGames) || 0),
    [edition, minimumGames, query, selectedSourceMetric],
  );
  return <section className="field-card" aria-labelledby="wbb-teams-title">
    <div className="eyebrow">WOMEN&apos;S TEAM BOARD · D1</div>
    <h2 id="wbb-teams-title">Team ratings and source box-score stats</h2>
    <p className="muted">The model board ranks multi-season net margin. The source board exposes every retained 2026 team metric so the rating can be studied beside the underlying production. A missing value remains unavailable.</p>
    {!publication && !edition ? <p className="muted">Loading women&apos;s team data…</p> : <>
      <label className="control" htmlFor="wbb-team-search"><span>SEARCH TEAM</span><input id="wbb-team-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Program or source ID" /></label>
      <div className="wbb-team-views" aria-label="Women&apos;s team board views">
        <button className={`button ${view === "ratings" ? "" : "secondary"}`} type="button" aria-pressed={view === "ratings"} onClick={() => setView("ratings")}>Model ratings</button>
        <button className={`button ${view === "source" ? "" : "secondary"}`} type="button" aria-pressed={view === "source"} onClick={() => setView("source")}>Source team stats</button>
      </div>
      {view === "ratings" ? <>
        {!publication?.team_ratings ? <p className="muted">The women&apos;s rating board is unavailable.</p> : <>
          <p className="note">{publication.coverage.rated_teams.toLocaleString()} rated teams · showing {rows.length} matching rows · target season {publication.target_season}.</p>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Team</th><th className="numeric">Games</th><th className="numeric">Net rating</th><th className="numeric">For</th><th className="numeric">Against</th></tr></thead><tbody>{rows.map((row) => <tr key={row.team_id}><td className="rank-number">{query ? "—" : row.rank}</td><th scope="row">{row.team}<small>Source team {row.team_id}</small></th><td className="numeric">{row.games.toLocaleString()}</td><td className="numeric"><strong>{row.rating.toFixed(2)}</strong></td><td className="numeric">{row.points.toFixed(1)}</td><td className="numeric">{row.allowed.toFixed(1)}</td></tr>)}</tbody></table></div>
          {!rows.length ? <p className="empty">No rated teams match this search.</p> : null}
        </>}
      </> : <>
        {!edition?.team_stats?.length || !selectedSourceMetric ? <p className="muted">The source team stat release is unavailable.</p> : <>
          <div className="wbb-team-source-controls">
            <label htmlFor="wbb-team-metric">Source metric</label>
            <select id="wbb-team-metric" value={selectedSourceMetric.key} onChange={(event) => setSourceMetric(event.target.value)}>{sourceMetrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label} · {metric.name}</option>)}</select>
            <label htmlFor="wbb-team-min-games">Minimum games</label>
            <select id="wbb-team-min-games" value={minimumGames} onChange={(event) => setMinimumGames(event.target.value)}><option value="0">Any recorded games</option><option value="5">5+</option><option value="10">10+</option></select>
          </div>
          <p className="note">{edition.coverage.team_stats_teams.toLocaleString()} source teams · {edition.coverage.team_stats_fields.toLocaleString()} retained metrics · showing {sourceRows.length} matching rows · observed season {edition.observed_player_season} · {selectedSourceMetric.description}</p>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Team</th><th className="numeric">Games</th><th className="numeric">{selectedSourceMetric.label}</th><th>{selectedSourceMetric.derived ? "Derived field" : "Recorded field"}</th></tr></thead><tbody>{sourceRows.map((row) => <tr key={row.team_id}><th scope="row">{row.team}<small>Source team {row.team_id}{row.abbreviation ? ` · ${row.abbreviation}` : ""}</small></th><td className="numeric">{formatWomensTeamStat(row.stats.gamesPlayed, sourceMetrics.find((metric) => metric.key === "gamesPlayed"))}</td><td className="numeric"><strong>{formatWomensTeamStat(womensTeamMetricValue(row, selectedSourceMetric.key), selectedSourceMetric)}</strong></td><td><code>{selectedSourceMetric.key}</code><small>{selectedSourceMetric.name}</small></td></tr>)}</tbody></table></div>
          {!sourceRows.length ? <p className="empty">No source teams match this search and threshold.</p> : null}
          <p className="muted">Source values are published team-season records. They are not a new rating, ranking, or forecast.</p>
        </>}
      </>}
    </>}
  </section>;
}
