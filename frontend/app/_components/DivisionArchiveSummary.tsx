"use client";

import { useEffect, useState } from "react";
import {
  divisionSummaryMetrics,
  summarizeDivisionArchive,
  type DivisionArchiveSummary as Summary,
  type LowerBasketballDivision,
} from "../_lib/division-archive-summary";
import DivisionCoverageMatrix from "./DivisionCoverageMatrix";
import MensLowerDivisionScheduleArchive from "./MensLowerDivisionScheduleArchive";
import MensLowerDivisionRatings from "./MensLowerDivisionRatings";

const date = (value: string | null) => {
  if (!value) return "capture date unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "capture date unavailable" : parsed.toLocaleDateString("en-US", { timeZone: "UTC" });
};

const coverage = (observed: number, total: number) => total > 0
  ? `${observed.toLocaleString()} / ${total.toLocaleString()} (${((observed / total) * 100).toFixed(1)}%)`
  : "0 / 0 (—)";

export default function DivisionArchiveSummary({ division }: { division: LowerBasketballDivision }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/basketball/ncaa-individual.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Division archive unavailable.")))
      .then((value: unknown) => {
        if (!controller.signal.aborted) setSummary(summarizeDivisionArchive(value, division));
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Division archive unavailable.");
        }
      });
    return () => controller.abort();
  }, [division]);

  return <section className="paper-panel division-archive-summary" aria-labelledby="division-archive-summary-title">
    <div className="eyebrow">MEN&apos;S BASKETBALL · D{division} ARCHIVE</div>
    <h2 id="division-archive-summary-title">Published rows for Division {division}</h2>
    <p className="note">This scope has a retained final-season player and team directory. Counts below come from the checked-in release; missing source fields remain unavailable.</p>
    {error ? <p className="status-error" role="alert">{error}</p> : !summary ? <p className="muted" role="status">Loading division archive summary…</p> : <>
      <nav className="division-archive-jump" aria-label={`Men's basketball Division ${division} archive sections`}>
        <span className="division-archive-jump-label">D{division} archive</span>
        <a href={`/basketball/ratings/?gender=men&division=${division}`}>Teams</a>
        <a href={`/basketball/players/?gender=men&division=${division}`}>Players</a>
        <a href={`#mens-lower-schedule-${division}`}>Matches</a>
        <a href={`#mens-lower-predictions-${division}`}>Predictions</a>
        <a href={`#mens-lower-recruiting-${division}`}>Recruiting</a>
        <a href={`#mens-lower-coverage-${division}`}>Learn &amp; coverage</a>
      </nav>
      <div id={`mens-lower-coverage-${division}`}>
        <DivisionCoverageMatrix sport="basketball" gender="men" division={division} />
      </div>
      <div id={`mens-lower-schedule-${division}`}>
        <MensLowerDivisionScheduleArchive division={division} />
      </div>
      <div id={`mens-lower-ratings-${division}`}>
        <MensLowerDivisionRatings division={division} />
      </div>
      <section id={`mens-lower-predictions-${division}`} className="paper-panel division-archive-gate" aria-labelledby={`mens-lower-predictions-title-${division}`}>
        <div className="eyebrow">PREDICTIONS · MEN&apos;S D{division}</div>
        <h3 id={`mens-lower-predictions-title-${division}`}>Forecasts stay gated until the target schedule is present</h3>
        <p className="note">The historical D{division} ratings above are descriptive evidence from retained finals. No 2026–27 forecast is published while the exact-division target schedule probe is empty; a D1 model row is never substituted.</p>
      </section>
      <section id={`mens-lower-recruiting-${division}`} className="paper-panel division-archive-gate" aria-labelledby={`mens-lower-recruiting-title-${division}`}>
        <div className="eyebrow">RECRUITING · MEN&apos;S D{division}</div>
        <h3 id={`mens-lower-recruiting-title-${division}`}>Recruiting joins are unavailable for this scope</h3>
        <p className="note">The retained lower-division release contains descriptive player and team rows, but no validated recruiting identity crosswalk. This page keeps that gap visible instead of attaching prospects to the wrong player or division.</p>
      </section>
      <div className="scope-snapshot-counts" aria-label={`Division ${division} archive counts`}>
        <strong>{summary.players.toLocaleString()}</strong><span>player rows</span>
        <strong>{summary.teams.toLocaleString()}</strong><span>team rows</span>
      </div>
      <section id={`mens-lower-player-stats-${division}`} className="paper-panel" aria-labelledby="division-player-evidence-title" style={{ marginTop: 18 }}>
        <div className="eyebrow">PLAYER IDENTITY &amp; STAT COVERAGE</div>
        <h3 id="division-player-evidence-title">What the player release actually contains</h3>
        <p className="note">Each row below is keyed by the exact player ID retained in this Division {division} archive. Identity coverage can be complete even when a publisher exposes only a bounded leaderboard for a selected statistic; missing values remain missing.</p>
        {summary.sourceCoverage ? <p className="note" role="status">The national individual release publishes qualified leaderboards for these metrics. The source row count and highest published rank are shown below; this release is not presented as a complete game-box player archive.</p> : null}
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Recorded field</th><th className="numeric">Observed / player rows</th><th>Reading</th></tr></thead>
            <tbody>
              <tr><th scope="row">Exact player IDs</th><td className="numeric">{coverage(summary.playerEvidence.exact_player_ids, summary.players)}</td><td>Stable source identity available for this release row.</td></tr>
              <tr><th scope="row">Player names</th><td className="numeric">{coverage(summary.playerEvidence.names, summary.players)}</td><td>Name labels are retained separately from the identity key.</td></tr>
              <tr><th scope="row">Team IDs</th><td className="numeric">{coverage(summary.playerEvidence.team_ids, summary.players)}</td><td>Exact source team identity available; no name-only team join is used.</td></tr>
              <tr><th scope="row">Team names</th><td className="numeric">{coverage(summary.playerEvidence.team_names, summary.players)}</td><td>Display label coverage for the source team.</td></tr>
              <tr><th scope="row">Positions</th><td className="numeric">{coverage(summary.playerEvidence.positions, summary.players)}</td><td>Source position label; blank means unavailable.</td></tr>
              <tr><th scope="row">Class year</th><td className="numeric">{coverage(summary.playerEvidence.class_years, summary.players)}</td><td>Source class label; blank means unavailable.</td></tr>
              <tr><th scope="row">Games played</th><td className="numeric">{coverage(summary.playerEvidence.games, summary.players)}</td><td>Recorded games denominator for rate fields.</td></tr>
              <tr><th scope="row">Rows with source stat snapshots</th><td className="numeric">{coverage(summary.playerEvidence.source_stat_rows, summary.players)}</td><td>At least one publisher leaderboard record is attached.</td></tr>
              <tr><th scope="row">Retained source stat snapshots</th><td className="numeric">{summary.playerEvidence.source_stat_snapshots.toLocaleString()}</td><td>One player can have multiple metric-specific source snapshots.</td></tr>
              {divisionSummaryMetrics.map(([key, label]) => { const source = summary.sourceCoverage?.[key]; return <tr key={key}><th scope="row">{label}</th><td className="numeric">{coverage(summary.playerEvidence.metrics[key], summary.players)}</td><td>{source ? `Qualified leaderboard: ${source.rows.toLocaleString()} source rows${source.max_rank == null ? "" : ` · highest published rank #${source.max_rank.toLocaleString()}`}.` : "Finite value in the retained player row; this can be lower than the identity denominator when the source leaderboard is bounded."}</td></tr>; })}
            </tbody>
          </table>
        </div>
      </section>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Recorded field</th><th className="numeric">Rows with value</th></tr></thead>
          <tbody>{divisionSummaryMetrics.map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td className="numeric">{summary.metrics[key].toLocaleString()}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="note">Season {summary.season == null ? "unavailable" : `${summary.season - 1}–${String(summary.season).slice(-2)}`} · captured {date(summary.generated_at)}. The archive supports descriptive lookup and within-division sorting; Silvermine D1 ratings and forecasts are not substituted.</p>
    </>}
  </section>;
}
