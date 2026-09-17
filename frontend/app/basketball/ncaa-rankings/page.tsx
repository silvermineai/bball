import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import NcaaRankings from "./NcaaRankings";

export const metadata = {
  title: "Player rankings",
  description: "Rank men’s college basketball players by scoring, rebounding, playmaking and shooting efficiency.",
};

type IndividualPlayer = {
  player_id: number;
  division?: number;
  name: string;
  team_name?: string | null;
  conference?: string | null;
  class_year?: string | null;
  position?: string | null;
  games?: number | null;
  ppg?: number | null;
  rpg?: number | null;
  apg?: number | null;
  mpg?: number | null;
  ppg_rank?: number | null;
  fgm?: number | null;
  fga?: number | null;
  three_fgm?: number | null;
  fta?: number | null;
  pts?: number | null;
};

const number = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);
const percent = (value: number | null | undefined) => value == null ? "—" : `${value.toFixed(1)}%`;
const trueShooting = (player: IndividualPlayer) => {
  if (!player.pts || !player.fga || player.fga <= 0) return null;
  const denominator = 2 * (player.fga + 0.44 * (player.fta || 0));
  return denominator > 0 ? 100 * player.pts / denominator : null;
};

function getScoringLeaders() {
  const file = path.join(process.cwd(), "public/data/basketball/ncaa-individual.json");
  if (!fs.existsSync(file)) return [] as IndividualPlayer[];
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { season?: number; players?: IndividualPlayer[] };
  return (data.players || [])
    .filter((player) => player.division === 1 && player.games && player.ppg != null)
    .sort((a, b) => (b.ppg ?? -1) - (a.ppg ?? -1) || a.name.localeCompare(b.name))
    .slice(0, 20);
}

export default function Page() {
  const leaders = getScoringLeaders();
  return <>
    <section className="paper-panel" aria-labelledby="scoring-leaders" style={{ marginBottom: 24 }}>
      <div className="section-heading" style={{ marginBottom: 12 }}>
        <div>
          <div className="eyebrow">Current season / Division I</div>
          <h2 id="scoring-leaders">Player leaders, with the full stat line</h2>
        </div>
        <span className="note">Top 20 by points per game · minimum one game</span>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Rank</th><th>Player</th><th>Program</th><th>Class / pos.</th><th className="numeric">GP</th><th className="numeric">MPG</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">TS%</th></tr></thead>
          <tbody>{leaders.map((player, index) => <tr key={player.player_id}>
            <td className="numeric"><strong>#{player.ppg_rank || index + 1}</strong></td>
            <td><Link href={`/basketball/ncaa-player/?id=${encodeURIComponent(player.player_id)}&season=2026`}>{player.name} →</Link><small>Archive ID {player.player_id}</small></td>
            <td><strong>{player.team_name || "—"}</strong><small>{player.conference || "Conference unavailable"}</small></td>
            <td>{[player.class_year, player.position].filter(Boolean).join(" · ") || "—"}</td>
            <td className="numeric">{number(player.games, 0)}</td>
            <td className="numeric">{number(player.mpg)}</td>
            <td className="numeric"><strong>{number(player.ppg)}</strong></td>
            <td className="numeric">{number(player.rpg)}</td>
            <td className="numeric">{number(player.apg)}</td>
            <td className="numeric">{percent(trueShooting(player))}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!leaders.length && <p className="empty">The current player edition is unavailable.</p>}
      <p className="note" style={{ marginTop: 12 }}>These are recorded season totals and rates. Use the ranking explorer below to change the metric, workload minimums, or player search.</p>
    </section>
    <NcaaRankings />
  </>;
}
