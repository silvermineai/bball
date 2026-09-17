import { Suspense } from "react";
import Link from "next/link";
import { getBasketball } from "../../_lib/basketball-data";
import { fmt } from "../../_lib/format";
import TeamStats from "./TeamStats";

export const metadata = {
  title: "Team-season statistics browser",
  description: "Search team-season statistics across the college basketball archive.",
  alternates: { canonical: "/basketball/team-stats/" },
};

export default function Page() {
  const teams = getBasketball().ratings.slice(0, 24);
  const pct = (value: number | null | undefined) => value == null ? "—" : `${fmt(value * 100)}%`;
  return <>
    <section className="paper-panel" aria-labelledby="team-efficiency" style={{ marginBottom: 24 }}>
      <div className="section-heading" style={{ marginBottom: 12 }}>
        <div>
          <div className="eyebrow">Current team board / 2025–26 baseline</div>
          <h2 id="team-efficiency">Efficiency and Four Factors</h2>
        </div>
        <span className="note">Top 24 by adjusted net efficiency</span>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Rank</th><th>Program</th><th className="numeric">W–L</th><th className="numeric">Adj O</th><th className="numeric">Adj D</th><th className="numeric">NET</th><th className="numeric">PACE</th><th className="numeric">SOS</th><th className="numeric">eFG%</th><th className="numeric">TO%</th><th className="numeric">ORB%</th><th className="numeric">FTR</th></tr></thead>
          <tbody>{teams.map((team) => <tr key={team.id}>
            <td className="numeric"><strong>#{team.rank}</strong></td>
            <th scope="row"><Link href={`/basketball/programs/${encodeURIComponent(team.id)}/`}>{team.name} →</Link><small>{team.games} games · {team.sos_games} rated opponents</small></th>
            <td className="numeric">{team.wins}–{Math.max(0, team.games - team.wins)}</td>
            <td className="numeric">{fmt(team.adj_off)}</td>
            <td className="numeric">{fmt(team.adj_def)}</td>
            <td className="numeric"><strong>{fmt(team.adj_net)}</strong></td>
            <td className="numeric">{fmt(team.adj_tempo)}</td>
            <td className="numeric">{fmt(team.sos)}</td>
            <td className="numeric">{pct(team.efg)}</td>
            <td className="numeric">{pct(team.tov_rate)}</td>
            <td className="numeric">{pct(team.orb_rate)}</td>
            <td className="numeric">{pct(team.ft_rate)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 12 }}>These are the current model baseline ratings. Use the field browser below to search historical team-season records across the full archive.</p>
    </section>
    <Suspense fallback={<p>Loading team statistics…</p>}><TeamStats /></Suspense>
  </>;
}
