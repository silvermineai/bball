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
      <DivisionCoverageMatrix sport="basketball" gender="men" division={division} />
      <MensLowerDivisionScheduleArchive division={division} />
      <div className="scope-snapshot-counts" aria-label={`Division ${division} archive counts`}>
        <strong>{summary.players.toLocaleString()}</strong><span>player rows</span>
        <strong>{summary.teams.toLocaleString()}</strong><span>team rows</span>
      </div>
      <section className="paper-panel" aria-labelledby="division-player-evidence-title" style={{ marginTop: 18 }}>
        <div className="eyebrow">PLAYER IDENTITY &amp; STAT COVERAGE</div>
        <h3 id="division-player-evidence-title">What the player release actually contains</h3>
        <p className="note">Each row below is keyed by the exact NCAA player ID retained in this Division {division} archive. Identity coverage can be complete even when a publisher exposes only a bounded leaderboard for a selected statistic; missing values remain missing.</p>
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
              {divisionSummaryMetrics.map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td className="numeric">{coverage(summary.playerEvidence.metrics[key], summary.players)}</td><td>Finite value in the retained player row; this can be lower than the identity denominator when the source leaderboard is bounded.</td></tr>)}
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
