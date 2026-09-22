import Link from "next/link";
import type { RecruitingCoverageAssessment } from "../_lib/recruiting-coverage";

export default function RecruitingCoverageBoundary({
  assessment,
  edition,
  counts,
}: {
  assessment: RecruitingCoverageAssessment;
  edition: string;
  counts: { players: number; events: number; sources: number; historicalLinks: number };
}) {
  const statusLabel = assessment.status === "complete"
    ? "Complete national coverage"
    : assessment.status === "partial"
      ? "Partial national coverage"
      : "Coverage scope unavailable";
  return (
    <section className="paper-panel" aria-label="Recruiting coverage boundary" style={{ marginBottom: 22 }}>
      <div className="section-heading" style={{ marginBottom: 10 }}>
        <div>
          <div className="eyebrow">Recruiting evidence boundary</div>
          <h2>{statusLabel}</h2>
        </div>
        <span className="mono">Edition {edition.slice(0, 12)}…</span>
      </div>
      <p className="note">
        The board shows retained recruiting records. It does not fill gaps with estimates, and a missing program record does not mean that no recruiting activity occurred.
      </p>
      <div className="strip" style={{ marginBottom: 12 }}>
        <div><strong>{counts.players.toLocaleString()}</strong><span>Recorded people</span></div>
        <div><strong>{counts.events.toLocaleString()}</strong><span>Dated events</span></div>
        <div><strong>{counts.sources.toLocaleString()}</strong><span>Source records</span></div>
        <div><strong>{counts.historicalLinks.toLocaleString()}</strong><span>Prior stat links</span></div>
      </div>
      <p className="note">
        {assessment.directoryPrograms == null
          ? "No comparison denominator is retained for the program directory."
          : `${assessment.observedPrograms.toLocaleString()} of ${assessment.directoryPrograms.toLocaleString()} directory programs are represented in this reviewed evidence set (${assessment.observedProgramShare == null ? "—" : `${(assessment.observedProgramShare * 100).toFixed(1)}%`}). ${assessment.unrepresentedPrograms?.toLocaleString() || 0} have no retained recruiting record in this edition.`}
        {" "}
        {assessment.countsConsistent ? "Release counts reconcile to the visible people, event and source arrays." : "The release counts do not reconcile to its visible arrays; treat the edition as unreconciled."}
      </p>
      {assessment.reviewQueue && <p className="note" role="status">
        Roster review queue: {assessment.reviewQueue.reviewedPrograms.toLocaleString()} of {assessment.reviewQueue.observedPrograms.toLocaleString()} observed programs have reviewed announcements; {assessment.reviewQueue.unreviewedPrograms.toLocaleString()} remain roster observations to review. {assessment.reviewQueue.reviewedNotObservedPrograms.toLocaleString()} reviewed source program{assessment.reviewQueue.reviewedNotObservedPrograms === 1 ? " is" : "s are"} absent from this roster snapshot. {assessment.reviewQueue.countsConsistent ? "Queue counts reconcile to its retained rows." : "Queue counts do not reconcile; treat the queue denominator as unreconciled."}
      </p>}
      <Link className="hero-link" href="/research/coverage/">Review capture clocks and dataset coverage →</Link>
    </section>
  );
}
