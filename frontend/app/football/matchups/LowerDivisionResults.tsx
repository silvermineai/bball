"use client";

import { useEffect, useMemo, useState } from "react";
import {
  lowerForecastCsvRows,
  lowerForecastsForDivision,
  lowerForecastUncertainty,
  lowerResultsForDivision,
  validateLowerFootballResults,
  type LowerFootballDivision,
  type LowerFootballForecastSort,
  type LowerFootballResults,
} from "../../_lib/football-lower-results";
import { lowerFootballReadiness } from "../../_lib/football-lower-readiness";
import { date, fmt, kick } from "../../_lib/format";
import { downloadCsv, toCsv } from "../../_lib/csv";

export default function LowerDivisionResults() {
  const [archive, setArchive] = useState<LowerFootballResults | null>(null);
  const [division, setDivision] = useState<LowerFootballDivision>("d2");
  const [query, setQuery] = useState("");
  const [forecastQuery, setForecastQuery] = useState("");
  const [forecastSort, setForecastSort] = useState<LowerFootballForecastSort>("kickoff");
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
  const readiness = archive ? lowerFootballReadiness(archive) : [];
  const forecasts = archive ? lowerForecastsForDivision(archive, division, forecastQuery, forecastSort) : [];
  const model = archive?.models[division];
  const forecastCoverage = coverage && coverage.upcoming_games ? (coverage.forecast_games || 0) / coverage.upcoming_games : null;

  return (
    <section className="paper-panel" aria-labelledby="lower-division-results-title" style={{ marginTop: 28 }}>
      <div className="section-heading">
        <div><div className="eyebrow">RECORDED LOWER-DIVISION RESULTS</div><h2 id="lower-division-results-title">D2 and D3 scores, with the boundary intact.</h2></div>
        {archive?.generated_at ? <span className="note">Edition generated {date(archive.generated_at)}</span> : null}
      </div>
      <p className="note">This archive keeps source scores separate from the division-isolated Silvermine model. Ratings and forecasts appear only when the retained exact-division history passes its minimum training and calibration gates; player production remains a separate source surface.</p>
      {error ? <p className="status-error" role="alert">{error}</p> : !archive ? <p className="empty" role="status">Loading recorded lower-division results…</p> : <>
        <div className="strip">
          <div><strong>{coverage?.games.toLocaleString() ?? "—"}</strong><span>D{division.slice(1)} games</span></div>
          <div><strong>{coverage?.score_complete.toLocaleString() ?? "—"}</strong><span>Complete scores</span></div>
          <div><strong>{coverage?.scores_missing.toLocaleString() ?? "—"}</strong><span>Missing scores</span></div>
          <div><strong>{teams.length.toLocaleString()}</strong><span>Team records</span></div>
          <div><strong>{coverage?.forecast_games?.toLocaleString() ?? "0"}</strong><span>Forecasts</span></div>
        </div>
        <div className="table-scroll" style={{ marginTop: 20 }}>
          <table className="data-table">
            <caption className="eyebrow" style={{ textAlign: "left", paddingBottom: 10 }}>Lower-division publication readiness</caption>
            <thead><tr><th>Division</th><th className="numeric">Schedule rows</th><th className="numeric">Complete scores</th><th className="numeric">Score coverage</th><th className="numeric">Team rows</th><th>Player stats</th><th>Predictions</th><th>Receipt</th></tr></thead>
            <tbody>{readiness.map((row) => <tr key={row.division}>
              <th scope="row">{row.division.toUpperCase()}<small>Source-native scope</small></th>
              <td className="numeric">{row.scheduleRows.toLocaleString()}</td>
              <td className="numeric">{row.completeScoreRows.toLocaleString()}</td>
              <td className="numeric">{row.scoreCoverage == null ? "—" : `${Math.round(row.scoreCoverage * 100)}%`}</td>
              <td className="numeric">{row.teamRows.toLocaleString()}</td>
              <td>{row.playerStats === "unavailable" ? "Unavailable" : "Recorded"}</td>
              <td>{row.predictions === "unavailable" ? "Unavailable" : "Recorded"}</td>
              <td>{row.receipt === "valid" ? "Valid" : <span className="status-error">Unavailable</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="toolbar" style={{ marginTop: 18 }}>
          <label className="control"><span>DIVISION</span><select value={division} onChange={(event) => setDivision(event.target.value as LowerFootballDivision)}><option value="d2">Division II</option><option value="d3">Division III</option></select></label>
          <label className="control"><span>TEAM OR GAME</span><input type="search" maxLength={100} value={query} placeholder="Search a team or game ID" onChange={(event) => setQuery(event.target.value)} /></label>
        </div>
        <div className="two-col" style={{ marginTop: 20 }}>
          <div><h3>Team records and model ratings</h3><div className="table-scroll"><table className="data-table"><thead><tr><th>Team</th><th className="numeric">W–L</th><th className="numeric">PF</th><th className="numeric">PA</th><th className="numeric">Model</th></tr></thead><tbody>{(archive.models[division]?.ratings ?? teams).slice(0, 12).map((team) => { const record = teams.find((item) => item.team_id === team.team_id); return <tr key={team.team_id}><th scope="row">{team.team}<small>{team.team_id}{"rank" in team ? ` · rank ${team.rank}` : ""}</small></th><td className="numeric">{record ? <><strong>{record.wins}–{record.losses}</strong><small>{record.games} scored games</small></> : "—"}</td><td className="numeric">{record ? fmt(record.points_for, 0) : "—"}</td><td className="numeric">{record ? fmt(record.points_against, 0) : "—"}</td><td className="numeric">{"rating" in team ? fmt(team.rating) : "—"}</td></tr>; })}</tbody></table></div>{archive.models[division] ? <p className="note">{archive.models[division].training_games.toLocaleString()} exact-division finals across {archive.models[division].training_seasons.join(", ")}; model {archive.models[division].id}.</p> : <p className="note">No validated model edition is published for this division.</p>}</div>
          <div><h3>Recorded results</h3><div className="table-scroll"><table className="data-table"><thead><tr><th>Start</th><th>Matchup</th><th className="numeric">Score</th></tr></thead><tbody>{rows.slice(0, 16).map((row) => <tr key={`${row.scope_division}-${row.game_id}`}><td>{kick(row.kickoff)}<small>{row.week == null ? "Week unavailable" : `Week ${row.week}`}</small></td><th scope="row">{row.away_name} at {row.home_name}<small>{row.game_id}{row.neutral ? " · neutral" : ""}</small></th><td className="numeric">{row.score_complete ? <strong>{row.away_score}–{row.home_score}</strong> : "—"}</td></tr>)}</tbody></table></div>{!rows.length ? <p className="empty">No recorded rows match this filter.</p> : rows.length > 16 ? <p className="note">Showing 16 of {rows.length.toLocaleString()} matching results.</p> : null}</div>
        </div>
        <div style={{ marginTop: 20 }}>
          <div className="section-heading" style={{ marginBottom: 12 }}>
            <div><h3>Upcoming division forecasts</h3><p className="note">Sort by the published point estimate or its margin interval. Interval width is an uncertainty signal, not a claim of certainty.</p></div>
            <button className="button secondary" type="button" onClick={() => downloadCsv(`football-${division}-forecasts.csv`, toCsv(["Division", "Game ID", "Start", "Away", "Home", "Venue", "Model", "Away points", "Home points", "Total", "Home margin", "Home win probability", "Margin low", "Margin high", "Margin interval width"], lowerForecastCsvRows(forecasts)))} disabled={!forecasts.length}>Download forecasts ↓</button>
          </div>
          <div className="toolbar" style={{ marginTop: 12 }}>
            <label className="control"><span>SEARCH FORECASTS</span><input type="search" maxLength={100} value={forecastQuery} placeholder="Search a team or game ID" onChange={(event) => setForecastQuery(event.target.value)} /></label>
            <label className="control"><span>SORT FORECASTS</span><select value={forecastSort} onChange={(event) => setForecastSort(event.target.value as LowerFootballForecastSort)}><option value="kickoff">Earliest start</option><option value="home_win_probability">Home win probability</option><option value="home_margin">Home margin</option><option value="uncertainty">Narrowest margin interval</option></select></label>
          </div>
          <div className="strip" style={{ marginTop: 16 }}>
            <div><strong>{coverage?.upcoming_games?.toLocaleString() ?? "—"}</strong><span>Upcoming schedule rows</span></div>
            <div><strong>{coverage?.forecast_games?.toLocaleString() ?? "0"}</strong><span>Validated forecasts</span></div>
            <div><strong>{forecastCoverage == null ? "—" : `${fmt(forecastCoverage * 100, 1)}%`}</strong><span>Forecast coverage</span></div>
            <div><strong>{model?.training_games?.toLocaleString() ?? "—"}</strong><span>Exact-division training finals</span></div>
          </div>
          {forecasts.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Start</th><th>Matchup</th><th className="numeric">Projected score</th><th className="numeric">Home win%</th><th className="numeric">Margin</th><th className="numeric">Interval width</th></tr></thead><tbody>{forecasts.slice(0, 32).map((row) => <tr key={row.game_id}><td>{kick(row.kickoff)}<small>{row.game_id} · {row.model_id}</small></td><th scope="row">{row.away_name} at {row.home_name}<small>{row.neutral ? "Neutral site" : "Home field included"}</small></th><td className="numeric"><strong>{fmt(row.prediction.away_score, 1)}–{fmt(row.prediction.home_score, 1)}</strong><small>Total {fmt(row.prediction.total, 1)}</small></td><td className="numeric">{fmt(row.prediction.home_win_probability * 100, 1)}%</td><td className="numeric">{fmt(row.prediction.home_margin, 1)}</td><td className="numeric">{fmt(lowerForecastUncertainty(row), 1)} pts<small>{fmt(row.prediction.margin_low, 1)} to {fmt(row.prediction.margin_high, 1)}</small></td></tr>)}</tbody></table></div> : <p className="empty">No validated upcoming forecasts match this filter.</p>}
          {forecasts.length > 32 ? <p className="note">Showing 32 of {forecasts.length.toLocaleString()} matching forecasts. Download the filtered table for the full set.</p> : null}
        </div>
        <p className="note" style={{ marginTop: 18 }}>Scores with missing source values stay visible in the archive but are excluded from team records. Cross-division games remain in the schedule archive; the displayed model uses exact-division finals only. A valid schedule receipt is a provenance gate, while the model and forecast counts above separately attest to the dated score history used.</p>
      </>}
    </section>
  );
}
