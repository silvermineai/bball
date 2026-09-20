"use client";

import { useEffect, useMemo, useState } from "react";

type Team = { rank: number; team_id: string; team: string; rating: number; points: number; allowed: number; games: number };
type Publication = { target_season: number; coverage: { rated_teams: number }; team_ratings: Team[] };

export default function WomensBasketballTeams() {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    fetch("/data/basketball/womens-forecast.json")
      .then((response) => response.ok ? response.json() : null)
      .then((value: Publication | null) => setPublication(value))
      .catch(() => setPublication(null));
  }, []);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (publication?.team_ratings || []).filter((row) => !needle || `${row.team} ${row.team_id}`.toLowerCase().includes(needle)).slice(0, 50);
  }, [publication, query]);
  return <section className="field-card" aria-labelledby="wbb-teams-title">
    <div className="eyebrow">WOMEN&apos;S TEAM BOARD · D1</div>
    <h2 id="wbb-teams-title">Team ratings and scoring profile</h2>
    <p className="muted">A separate women&apos;s multi-season margin model ranks teams by shrunk net margin. Points and allowed points are historical rates used by the forecast, not a betting line.</p>
    {!publication?.team_ratings ? <p className="muted">Loading women&apos;s team ratings…</p> : <>
      <label className="control" htmlFor="wbb-team-search"><span>SEARCH TEAM</span><input id="wbb-team-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Program or source ID" /></label>
      <p className="note">{publication.coverage.rated_teams.toLocaleString()} rated teams · showing {rows.length} matching rows · target season {publication.target_season}.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Team</th><th className="numeric">Games</th><th className="numeric">Net rating</th><th className="numeric">For</th><th className="numeric">Against</th></tr></thead><tbody>{rows.map((row) => <tr key={row.team_id}><td className="rank-number">{query ? "—" : row.rank}</td><th scope="row">{row.team}<small>Source team {row.team_id}</small></th><td className="numeric">{row.games.toLocaleString()}</td><td className="numeric"><strong>{row.rating.toFixed(2)}</strong></td><td className="numeric">{row.points.toFixed(1)}</td><td className="numeric">{row.allowed.toFixed(1)}</td></tr>)}</tbody></table></div>
      {!rows.length ? <p className="empty">No rated teams match this search.</p> : null}
    </>}
  </section>;
}
