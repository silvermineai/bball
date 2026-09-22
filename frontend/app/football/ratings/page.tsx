import { getFootballEfficiencyIndex, getOverview } from "../../_lib/data";
import { fmt, date } from "../../_lib/format";
import Link from "next/link";
import ScopedDashboard from "../../_components/ScopedDashboard";
import { joinFootballRatingEfficiency } from "../../_lib/football-ratings";
export const metadata = { title: "Football power ratings" };
function RatingsPage() {
  const d = getOverview();
  const efficiency = joinFootballRatingEfficiency(
    d.ratings,
    getFootballEfficiencyIndex(),
    d.season,
  );
  const formatRate = (value: number | null, decimals: number) =>
    value == null ? "—" : value.toFixed(decimals);
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
      <section className="section paper-panel" aria-labelledby="football-rating-efficiency">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Current team production / exact team ID</div>
            <h2 id="football-rating-efficiency">Efficiency beside strength</h2>
          </div>
          <span className="note">{efficiency.filter((row) => row.efficiency).length} matched teams</span>
        </div>
        <p className="note">
          Covered {d.season} finals joined to the ratings by exact team ID. EPA is points per play; yards are yards per play. A dash means the retained source did not measure that rate. The source release is partial and is dated below.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Program</th>
                <th>Division</th>
                <th className="numeric">Games</th>
                <th className="numeric">Off EPA/play</th>
                <th className="numeric">Def EPA/play</th>
                <th className="numeric">Off YPP</th>
                <th className="numeric">Def YPP</th>
              </tr>
            </thead>
            <tbody>
              {efficiency.map((row) => (
                <tr key={row.id}>
                  <td className="rank-number">{row.rank}</td>
                  <th scope="row">{row.name}<small>{row.conference}</small></th>
                  <td>{row.efficiency?.division?.toUpperCase() || "—"}</td>
                  <td className="numeric">{row.efficiency?.games ?? "—"}</td>
                  <td className="numeric">{formatRate(row.efficiency?.offense_epa ?? null, 3)}</td>
                  <td className="numeric">{formatRate(row.efficiency?.defense_epa ?? null, 3)}</td>
                  <td className="numeric">{formatRate(row.efficiency?.offense_ypp ?? null, 2)}</td>
                  <td className="numeric">{formatRate(row.efficiency?.defense_ypp ?? null, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 12 }}>
          Efficiency source fetched {efficiency.find((row) => row.efficiency)?.efficiency?.source_fetched_at || "—"}. Use the efficiency desk for game evidence and opponent scope; these rows are descriptive context and do not alter the Silvermine forecast.
        </p>
      </section>
      <p className="note">
        Program identities are matched to the latest imported team directory.
        This is our independent baseline, built from the retained game archive.
      </p>
    </>
  );
}

export default function Page() {
  return <ScopedDashboard sport="football"><RatingsPage /></ScopedDashboard>;
}
