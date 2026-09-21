import type { RecruitingRosterBridge } from "../../../_lib/recruiting-roster-bridge";

const number = (value: number | null) => value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 1 });

export default function ProspectRosterBridge({ bridge }: { bridge: RecruitingRosterBridge | null }) {
  return <section className="section paper-panel" aria-labelledby="prospect-roster-bridge-title">
    <div className="section-heading" style={{ marginBottom: 12 }}>
      <div><div className="eyebrow">Roster handoff / exact source ID</div><h2 id="prospect-roster-bridge-title">Follow the prospect into the college archive.</h2></div>
      <span className="note">{bridge?.integrity === "verified" ? "Source-receipted" : "Unavailable"}</span>
    </div>
    <p className="note">A row appears only when this publisher athlete ID is present in the retained roster or participation source. This is an exact-ID observation, separate from commitment, eligibility and future role.</p>
    {!bridge && <p className="empty" role="status">No validated roster bridge is attached to this prospect. Missing evidence is not treated as zero production.</p>}
    {bridge && bridge.integrity !== "verified" && <p className="empty" role="status">The exact-ID source rows were found, but their release receipt did not cover every observed season. The bridge is withheld from analysis.</p>}
    {bridge?.integrity === "verified" && <>
      {(bridge.roster_rows.length > 0 || bridge.participation_rows.length > 0) ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Season</th><th>Source observation</th><th>Program</th><th>Position / class</th><th className="numeric">Games</th><th className="numeric">Minutes</th></tr></thead><tbody>
        {bridge.roster_rows.map((row) => <tr key={`roster-${row.season}-${row.team_id}`}><td>{row.season}</td><th scope="row">Roster row</th><td>{row.team}<small>{row.team_id}</small></td><td>{row.position || "—"}<small>{row.class_year || "Class unavailable"}</small></td><td className="numeric">—</td><td className="numeric">—</td></tr>)}
        {bridge.participation_rows.map((row) => {
          const rosterTeam = bridge.roster_rows.find((candidate) => candidate.season === row.season && candidate.team_id === row.team_id)?.team;
          return <tr key={`participation-${row.season}-${row.team_id}`}><td>{row.season}</td><th scope="row">Participation row<small>{row.name || "Athlete name unavailable"}</small></th><td>{rosterTeam || "Program name unavailable"}<small>Team ID {row.team_id}</small></td><td>Prior production</td><td className="numeric">{number(row.games)}</td><td className="numeric">{number(row.minutes)}</td></tr>;
        })}
      </tbody></table></div> : <p className="empty" role="status">The exact athlete ID is present in the release boundary, but no roster or participation row is retained for the adjacent seasons.</p>}
      <p className="note" style={{ marginTop: 12 }}>{bridge.note} {bridge.receipts.map((receipt) => `${receipt.dataset} ${receipt.season} · ${receipt.sha256}`).join(" · ")}</p>
    </>}
  </section>;
}
