import { getOverview } from "../../_lib/data";
import { fmt, date } from "../../_lib/format";
import Link from "next/link";
export const metadata = { title: "Football power ratings" };
export default function Page() {
  const d = getOverview();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">National strength / {d.season}</div>
        <h1>Beyond the polls.</h1>
        <p>
          Opponent-adjusted team effects from the Silvermine ridge model. A
          higher number indicates stronger historical performance in points.
          These estimates use {d.model.training_seasons.join(", ")} results
          before {date(d.model.cutoff)}; roster and coaching changes are not
          modeled.
        </p>
      </div>
      <p className="note">
        <Link href="/football/efficiency/">
          Compare team efficiency and opponent production →
        </Link>
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Program</th>
              <th>Conference</th>
              <th className="numeric">Strength (points)</th>
              <th>Next step</th>
            </tr>
          </thead>
          <tbody>
            {d.ratings.map((t) => (
              <tr key={t.id}>
                <td className="rank-number">{t.rank}</td>
                <td>{t.name}</td>
                <td>{t.conference}</td>
                <td className="numeric">{fmt(t.rating)}</td>
                <td>
                  <Link
                    href={`/football/matchups/?team=${encodeURIComponent(t.name)}`}
                  >
                    Study schedule →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Program identities are matched to the latest imported team directory.
        This is our independent baseline, not ESPN FPI, SP+, or another
        publisher’s rating.
      </p>
    </>
  );
}
