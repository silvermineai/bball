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
        The retained football edition includes upcoming Division {availability.division} schedule rows, completed scores, and source-derived team records. The record board is descriptive and sorted from observed W–L and points totals; it is not an opponent-adjusted rating. Player stats, player rankings, and Silvermine predictions for this division are not published yet.
      </p>
      <DivisionCoverageMatrix sport="football" gender="men" division={availability.division} />
      <LowerDivisionResults />
      <div className="scope-unavailable-actions">
        <Link className="button" href={`/football/matchups/?division=${availability.division}`}>
          Open D{availability.division} schedule and results →
        </Link>
        <Link className="hero-link" href="/research/coverage/">
          View coverage details →
        </Link>
      </div>
    </section>
  );
}
