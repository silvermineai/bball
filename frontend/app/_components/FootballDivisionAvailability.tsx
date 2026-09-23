import Link from "next/link";
import { footballDivisionAvailability, type LowerFootballDivision } from "../_lib/football-division-scope";
import DivisionCoverageMatrix from "./DivisionCoverageMatrix";
import LowerDivisionResults from "../football/matchups/LowerDivisionResults";

export default function FootballDivisionAvailability({ division }: { division: LowerFootballDivision }) {
  const availability = footballDivisionAvailability(division);
  return (
    <section className="paper-panel football-division-availability" aria-labelledby="football-division-availability-title">
      <div className="eyebrow">MEN&apos;S FOOTBALL · D{availability.division}</div>
      <h2 id="football-division-availability-title">D{availability.division} schedule and observed records</h2>
      <p>
        The retained football edition includes upcoming Division {availability.division} schedule rows, completed scores, source-derived team records, and an exact-division Silvermine rating and forecast when the training gate passes. An exact-ID observed player archive and within-division production rankings are also available from retained game summaries. That archive is partial: unobserved games, missing categories and the canonical national player-stat release remain unavailable, and the model uses only dated scores, venue and team identity.
      </p>
      <DivisionCoverageMatrix sport="football" gender="men" division={availability.division} />
      <LowerDivisionResults initialDivision={availability.division === "3" ? "d3" : "d2"} />
      <div className="scope-unavailable-actions">
        <Link className="button" href={`/football/matchups/?division=${availability.division}`}>
          Open D{availability.division} schedule and results →
        </Link>
        <Link className="hero-link" href={`/football/players/?division=${availability.division}`}>
          Open D{availability.division} player production →
        </Link>
        <Link className="hero-link" href="/research/coverage/">
          View coverage details →
        </Link>
      </div>
    </section>
  );
}
