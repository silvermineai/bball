import Link from "next/link";
import { footballDivisionAvailability, type LowerFootballDivision } from "../_lib/football-division-scope";
import DivisionCoverageMatrix from "./DivisionCoverageMatrix";

export default function FootballDivisionAvailability({ division }: { division: LowerFootballDivision }) {
  const availability = footballDivisionAvailability(division);
  return (
    <section className="paper-panel football-division-availability" aria-labelledby="football-division-availability-title">
      <div className="eyebrow">MEN&apos;S FOOTBALL · D{availability.division}</div>
      <h2 id="football-division-availability-title">D{availability.division} schedule rows are available</h2>
      <p>
        The retained football edition includes upcoming Division {availability.division} schedule rows. Player stats, team production, rankings and Silvermine predictions for this division are not published yet; blank fields stay blank until division-labeled records pass validation.
      </p>
      <DivisionCoverageMatrix sport="football" gender="men" division={availability.division} />
      <div className="scope-unavailable-actions">
        <Link className="button" href={`/football/matchups/?division=${availability.division}`}>
          Open D{availability.division} matchup rows →
        </Link>
        <Link className="hero-link" href="/research/coverage/">
          View coverage details →
        </Link>
      </div>
    </section>
  );
}
