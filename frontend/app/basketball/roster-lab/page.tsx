import Link from "next/link";
import { getBasketball, getRosters } from "../../_lib/basketball-data";
import { buildRosterLabRows } from "../../_lib/roster-readiness";
import RosterLab from "./RosterLab";

export const metadata = {
  title: "2026–27 basketball roster impact lab",
  description:
    "Compare source-listed returning workload, incoming prior production, ratings and schedule coverage across 2026–27 college basketball programs.",
  alternates: { canonical: "/basketball/roster-lab/" },
};

export default function Page() {
  const overview = getBasketball();
  const rosters = getRosters();
  const rows = buildRosterLabRows(rosters, overview);
  const prior = rows.filter((row) => row.priorMinutes > 0);
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Roster construction / 2026–27 source view</div>
        <h1>See the workload<br /><em>that carried over.</em></h1>
        <p>
          A program-by-program view of the source-listed roster, prior recorded minutes, independent efficiency rating and published schedule coverage. Use it to prepare questions for a matchup and to find recruiting context worth checking.
        </p>
        <div className="hero-actions"><Link className="button" href="/basketball/recruiting/">Open recruiting evidence ↗</Link><Link className="hero-link" href="/basketball/matchups/">Open matchup slate →</Link></div>
      </div>
      <div className="strip" style={{ borderTop: "1px solid var(--ink)" }}>
        <div><strong>{rows.length.toLocaleString()}</strong><span>Source-listed programs</span></div>
        <div><strong>{rosters.players.length.toLocaleString()}</strong><span>Listed player records</span></div>
        <div><strong>{prior.length.toLocaleString()}</strong><span>Programs with prior minutes</span></div>
        <div><strong>{rows.filter((row) => row.ratingRank != null).length.toLocaleString()}</strong><span>Programs in efficiency field</span></div>
      </div>
      <section className="section paper-panel">
        <h2>Read the two workload shares together.</h2>
        <p><strong>Returning minutes share</strong> is same-program listed players’ prior minutes divided by all prior minutes observed for that program. <strong>Represented workload</strong> adds prior minutes from different-program listings. The denominator is the matched source sample; players with no prior record remain visible but contribute no minutes.</p>
        <p className="note">These are descriptive roster observations. They do not enter the Silvermine forecast, establish transfer status or eligibility, or imply that an unlisted player left. The independent rating is historical opponent-adjusted efficiency from the model notebook.</p>
      </section>
      <section className="section"><div className="section-heading"><div><div className="eyebrow">Program comparison</div><h2>Find the roster question.</h2></div><span className="note">Edition {rosters.season - 1}–{String(rosters.season).slice(-2)}</span></div><RosterLab rows={rows} /></section>
    </>
  );
}
