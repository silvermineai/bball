"use client";

import { useEffect, useMemo, useState } from "react";
import {
  lowerResultsForDivision,
  validateLowerFootballResults,
  type LowerFootballDivision,
  type LowerFootballResults,
} from "../../_lib/football-lower-results";
import { date, fmt, kick } from "../../_lib/format";

export default function LowerDivisionResults() {
  const [archive, setArchive] = useState<LowerFootballResults | null>(null);
  const [division, setDivision] = useState<LowerFootballDivision>("d2");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/football/lower-division-results-2026.json", { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The lower-division results archive could not be loaded."); return response.json() as Promise<unknown>; })
      .then((payload) => { if (!controller.signal.aborted) setArchive(validateLowerFootballResults(payload)); })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "The lower-division results archive is unavailable."); });
    return () => controller.abort();
  }, []);

  const rows = useMemo(() => {
    if (!archive) return [];
    const needle = query.trim().toLowerCase();
    return lowerResultsForDivision(archive, division).filter((row) => !needle || `${row.home_name} ${row.away_name} ${row.game_id}`.toLowerCase().includes(needle));
  }, [archive, division, query]);
  const teams = archive?.teams[division] || [];
  const coverage = archive?.coverage[division];

  return (
    <section className="paper-panel" aria-labelledby="lower-division-results-title" style={{ marginTop: 28 }}>
      <div className="section-heading">
        <div><div className="eyebrow">RECORDED LOWER-DIVISION RESULTS</div><h2 id="lower-division-results-title">D2 and D3 scores, with the boundary intact.</h2></div>
        {archive?.generated_at ? <span className="note">Edition generated {date(archive.generated_at)}</span> : null}
      </div>
      <p className="note">This is a completed schedule archive from the retained source release. It adds score and team-record context while keeping player stats, ratings, and predictions unavailable until a validated lower-division edition exists.</p>
      {error ? <p className="status-error" role="alert">{error}</p> : !archive ? <p className="empty" role="status">Loading recorded lower-division results…</p> : <>
        <div className="strip">
          <div><strong>{coverage?.games.toLocaleString() ?? "—"}</strong><span>D{division.slice(1)} games</span></div>
          <div><strong>{coverage?.score_complete.toLocaleString() ?? "—"}</strong><span>Complete scores</span></div>
          <div><strong>{coverage?.scores_missing.toLocaleString() ?? "—"}</strong><span>Missing scores</span></div>
          <div><strong>{teams.length.toLocaleString()}</strong><span>Team records</span></div>
        </div>
        <div className="toolbar" style={{ marginTop: 18 }}>
          <label className="control"><span>DIVISION</span><select value={division} onChange={(event) => setDivision(event.target.value as LowerFootballDivision)}><option value="d2">Division II</option><option value="d3">Division III</option></select></label>
          <label className="control"><span>TEAM OR GAME</span><input type="search" maxLength={100} value={query} placeholder="Search a team or game ID" onChange={(event) => setQuery(event.target.value)} /></label>
        </div>
        <div className="two-col" style={{ marginTop: 20 }}>
          <div><h3>Team records</h3><div className="table-scroll"><table className="data-table"><thead><tr><th>Team</th><th className="numeric">W–L</th><th className="numeric">PF</th><th className="numeric">PA</th></tr></thead><tbody>{teams.slice(0, 12).map((team) => <tr key={team.team_id}><th scope="row">{team.team}<small>{team.team_id}</small></th><td className="numeric"><strong>{team.wins}–{team.losses}</strong><small>{team.games} scored games</small></td><td className="numeric">{fmt(team.points_for, 0)}</td><td className="numeric">{fmt(team.points_against, 0)}</td></tr>)}</tbody></table></div></div>
          <div><h3>Recorded results</h3><div className="table-scroll"><table className="data-table"><thead><tr><th>Start</th><th>Matchup</th><th className="numeric">Score</th></tr></thead><tbody>{rows.slice(0, 16).map((row) => <tr key={`${row.scope_division}-${row.game_id}`}><td>{kick(row.kickoff)}<small>{row.week == null ? "Week unavailable" : `Week ${row.week}`}</small></td><th scope="row">{row.away_name} at {row.home_name}<small>{row.game_id}{row.neutral ? " · neutral" : ""}</small></th><td className="numeric">{row.score_complete ? <strong>{row.away_score}–{row.home_score}</strong> : "—"}</td></tr>)}</tbody></table></div>{!rows.length ? <p className="empty">No recorded rows match this filter.</p> : rows.length > 16 ? <p className="note">Showing 16 of {rows.length.toLocaleString()} matching results.</p> : null}</div>
        </div>
        <p className="note" style={{ marginTop: 18 }}>Scores with missing source values stay visible in the archive but are excluded from team records. Cross-division games remain in each lower division’s schedule cohort; no opponent strength or player production is inferred.</p>
      </>}
    </section>
  );
}

