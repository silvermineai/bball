import Link from "next/link";
import type { BBRosterPlayerWatch, BBRosterScenario } from "../_lib/basketball-types";
import { rotationWatchNumber, rotationWatchPlayerHref, rotationWatchRows, rotationWatchStatus } from "../_lib/rotation-watch";

function TeamWatch({
  name,
  players,
  season,
}: {
  name: string;
  players: BBRosterPlayerWatch[] | null | undefined;
  season: number;
}) {
  const rows = rotationWatchRows(players);
  return (
    <section className="rotation-watch-team" aria-label={`${name} player rotation watch`}>
      <h4>{name}</h4>
      {rows.length ? (
        <div className="table-scroll">
          <table className="data-table rotation-watch-table">
            <thead>
              <tr><th>Player</th><th>Continuity</th><th className="numeric">Prior min</th><th className="numeric">BPM</th><th className="numeric">BPM × min</th></tr>
            </thead>
            <tbody>
              {rows.map((player) => (
                <tr key={player.athlete_id}>
                  <th scope="row">
                    <Link href={rotationWatchPlayerHref(player.athlete_id, season)}>{player.name} ↗</Link>
                    <small>Exact player ID {player.athlete_id}</small>
                  </th>
                  <td>{rotationWatchStatus(player)}</td>
                  <td className="numeric">{rotationWatchNumber(player.prior_minutes)}</td>
                  <td className="numeric">{rotationWatchNumber(player.bpm)}</td>
                  <td className="numeric">{rotationWatchNumber(player.weighted_bpm_minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">Player watch unavailable; no exact-ID workload rows were published for this side.</p>
      )}
      {rows.length > 0 && rows.length < 5 && <p className="note">{rows.length} of 5 watched player rows are available; the remaining rows stay unavailable.</p>}
    </section>
  );
}

export default function RotationWatchPanel({
  scenario,
  awayName,
  homeName,
  priorSeason = 2026,
}: {
  scenario: BBRosterScenario;
  awayName: string;
  homeName: string;
  priorSeason?: number;
}) {
  return (
    <details className="rotation-watch-panel">
      <summary>Open player rotation watch · exact IDs</summary>
      <p className="note">The publisher watches up to five prior-minute records per side. BPM and weighted BPM-minutes are retained only when observed; continuity describes exact roster IDs and does not establish availability, eligibility, or expected role.</p>
      <div className="rotation-watch-grid">
        <TeamWatch name={`${awayName} · away`} players={scenario.away_player_watch} season={priorSeason} />
        <TeamWatch name={`${homeName} · home`} players={scenario.home_player_watch} season={priorSeason} />
      </div>
    </details>
  );
}
