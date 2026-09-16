import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { Game, Overview } from "../_lib/data";
import { getOverview } from "../_lib/data";
import { date, fmt, kick } from "../_lib/format";
import LiveFootballMarketStatus from "./LiveFootballMarketStatus";

type Production = {
  games?: number | null;
  plays: number | null;
  yards: number | null;
  yards_per_play?: number | null;
  epa: number | null;
  epa_per_play: number | null;
  touchdowns: number | null;
  rank: number | null;
};

type Player = {
  id: string;
  name: string;
  team: string;
  conference: string;
  division: string;
  production: Record<string, Production>;
};

type EventLeader = {
  player_name: string;
  team: string | null;
  division: string;
  records: number;
  games: number;
  value: number | null;
};

type EventEdition = {
  season: number;
  dataset: "defense" | "specialists";
  leaders: Record<string, EventLeader[]>;
  coverage: { records: number };
};

function getPlayers(season: number) {
  const file = path.join(process.cwd(), "public/data/football", `players-${season - 1}.json`);
  if (!fs.existsSync(file)) return [] as Player[];
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { players?: Player[] };
  return data.players || [];
}

function getEventEditions(season: number) {
  const file = path.join(process.cwd(), "public/data/football/events.json");
  if (!fs.existsSync(file)) return [] as EventEdition[];
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { editions?: EventEdition[] };
  return (data.editions || []).filter((edition) => edition.season === season);
}

function latestKickoff(game: Game) {
  return game.time_tbd ? "Time TBD" : kick(game.kickoff);
}

function ForecastTable({ games }: { games: Game[] }) {
  return (
    <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table forecast-table">
        <thead><tr><th>Game</th><th>Tip</th><th className="numeric">Projected</th><th className="numeric">Home win</th><th className="numeric">Margin</th><th className="numeric">Range</th><th className="numeric">Total</th></tr></thead>
        <tbody>{games.filter((game) => game.prediction).slice(0, 12).map((game) => {
          const prediction = game.prediction!;
          return <tr key={game.id}>
            <th scope="row"><Link href={`/football/matchups/?team=${encodeURIComponent(game.home_name)}`}><strong>{game.away_name}</strong><small>at {game.home_name}</small></Link></th>
            <td>{date(game.kickoff)}<small>{latestKickoff(game)}</small></td>
            <td className="numeric"><strong>{fmt(prediction.away_score)}–{fmt(prediction.home_score)}</strong></td>
            <td className="numeric"><strong>{fmt(prediction.home_win_probability * 100)}%</strong></td>
            <td className="numeric">{prediction.home_margin >= 0 ? "+" : ""}{fmt(prediction.home_margin)}</td>
            <td className="numeric">{prediction.margin_low >= 0 ? "+" : ""}{fmt(prediction.margin_low)} to {prediction.margin_high >= 0 ? "+" : ""}{fmt(prediction.margin_high)}<small>calibrated margin band</small></td>
            <td className="numeric">{fmt(prediction.total)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  );
}

function RatingsTable({ ratings }: { ratings: Overview["ratings"] }) {
  return <div className="dashboard-table-wrap">
    <table className="data-table dashboard-table">
      <thead><tr><th>#</th><th>Program</th><th>Conference</th><th className="numeric">Strength</th></tr></thead>
      <tbody>{ratings.slice(0, 12).map((team) => <tr key={team.id}>
        <td className="rank-number">{team.rank}</td>
        <th scope="row"><Link href={`/football/matchups/?team=${encodeURIComponent(team.name)}`}>{team.name}</Link></th>
        <td>{team.conference}</td>
        <td className="numeric"><strong>{fmt(team.rating)}</strong></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function PlayerTable({ players, season }: { players: Player[]; season: number }) {
  const rows = ["passing", "rushing", "receiving"].flatMap((category) => players
    .map((player) => ({ player, category, stats: player.production[category] }))
    .filter((row) => row.stats?.rank != null)
    .sort((a, b) => (a.stats.rank ?? Infinity) - (b.stats.rank ?? Infinity) || a.player.name.localeCompare(b.player.name))
    .slice(0, 4));
  return <div className="dashboard-table-wrap">
    <table className="data-table dashboard-table">
      <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Role</th><th className="numeric">Plays</th><th className="numeric">Yards</th><th className="numeric">TD</th><th className="numeric">EPA</th><th className="numeric">EPA/play</th></tr></thead>
      <tbody>{rows.map(({ player, category, stats }) => <tr key={`${player.id}-${category}`}>
        <td className="rank-number">{stats.rank}</td>
        <th scope="row"><Link href={`/football/player/?id=${encodeURIComponent(player.id)}&season=${season}`}>{player.name}</Link></th>
        <td>{player.team}</td>
        <td>{category}</td>
        <td className="numeric">{stats.plays == null ? "—" : fmt(stats.plays, 0)}</td>
        <td className="numeric">{stats.yards == null ? "—" : fmt(stats.yards, 0)}</td>
        <td className="numeric">{stats.touchdowns == null ? "—" : fmt(stats.touchdowns, 0)}</td>
        <td className="numeric"><strong>{fmt(stats.epa)}</strong></td>
        <td className="numeric">{fmt(stats.epa_per_play)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function EventLeadersTable({ editions }: { editions: EventEdition[] }) {
  const rows = editions.flatMap((edition) =>
    [
      ...(edition.dataset === "defense" ? ["sacks", "interceptions"] : []),
      ...(edition.dataset === "specialists" ? ["field_goals", "punts"] : []),
    ].flatMap((metric) =>
      (edition.leaders[metric] || []).slice(0, 3).map((leader) => ({
        ...leader,
        metric,
        label: metric === "field_goals" ? "field goals" : metric,
      })),
    ),
  );
  if (!rows.length) return <p className="empty">No current-season event leaders are available.</p>;
  return <div className="dashboard-table-wrap">
    <table className="data-table dashboard-table">
      <thead><tr><th>Player</th><th>Team</th><th>Stat</th><th className="numeric">Value</th><th className="numeric">Games</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={`${row.metric}-${row.player_name}-${row.team || ""}-${index}`}>
        <th scope="row">{row.player_name}</th>
        <td>{row.team || "—"}</td>
        <td>{row.label}</td>
        <td className="numeric"><strong>{row.value == null ? "—" : fmt(row.value)}</strong></td>
        <td className="numeric">{row.games.toLocaleString()}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

export default function FootballDashboard() {
  const overview = getOverview();
  const players = getPlayers(overview.season);
  const forecasts = overview.upcoming.filter((game) => game.prediction);
  const completedPlayerSeason = overview.season - 1;
  const eventEditions = getEventEditions(overview.season);
  return <div className="stats-dashboard football-dashboard">
    <div className="dashboard-kicker"><span>COLLEGE FOOTBALL</span><span>{overview.season} / LIVE BOARD</span></div>
    <section className="dashboard-hero">
      <div>
        <div className="eyebrow">Stats, ratings, games, predictions</div>
        <h1>The numbers<br /><em>on the board.</em></h1>
        <p>Team strength, player production and every available {overview.season} forecast in one fast view.</p>
        <div className="hero-actions"><Link className="button" href="/football/matchups/">All upcoming games ↗</Link><Link className="hero-link" href="/football/players/">Player stats →</Link><Link className="hero-link" href="/football/ratings/">Team ratings →</Link></div>
      </div>
      <div className="dashboard-model-card">
        <span className="model-tag primary">SILVERMINE MODEL</span>
        <strong>{overview.coverage.forecast_games.toLocaleString()}</strong>
        <span>game forecasts</span>
        <div className="dashboard-model-rule" />
        <div><b>{fmt(overview.model.evaluation.winner_accuracy * 100)}%</b><span>held-out winner accuracy</span></div>
        <div><b>{fmt(overview.model.evaluation.margin_mae)} pts</b><span>held-out margin error</span></div>
        <div><b>{overview.coverage.upcoming_games ? fmt((forecasts.length / overview.coverage.upcoming_games) * 100) : "—"}%</b><span>upcoming slate covered</span></div>
        <small>{fmt(Math.max(0, overview.model.evaluation.baseline_margin_mae - overview.model.evaluation.margin_mae))} pts lower margin error than the baseline on holdout games.</small>
      </div>
    </section>
    <LiveFootballMarketStatus />
    <div className="dashboard-strip">
      <div><strong>{overview.ratings.length}</strong><span>Rated teams</span></div>
      <div><strong>{players.length.toLocaleString()}</strong><span>Player profiles</span></div>
      <div><strong>{overview.coverage.upcoming_games.toLocaleString()}</strong><span>Upcoming games</span></div>
      <div><strong>{overview.coverage.ncaa_player_stats_rows.toLocaleString()}</strong><span>Player stat rows</span></div>
    </div>
    <section className="dashboard-section" aria-labelledby="football-games">
      <div className="dashboard-section-heading"><div><span className="eyebrow">01 / GAME CENTER</span><h2 id="football-games">Upcoming games &amp; predictions</h2></div><Link href="/football/matchups/">View all {forecasts.length.toLocaleString()} forecasts →</Link></div>
      <p className="dashboard-caption">Every row has a Silvermine score projection, win probability, margin, calibrated range and total. Historical market comparisons stay on the matchup desk when an eligible quote is available.</p>
      <ForecastTable games={forecasts} />
    </section>
    <div className="dashboard-two-col">
      <section className="dashboard-section" aria-labelledby="football-teams">
        <div className="dashboard-section-heading"><div><span className="eyebrow">02 / TEAM STATS</span><h2 id="football-teams">Power ratings</h2></div><Link href="/football/ratings/">Full team table →</Link></div>
        <p className="dashboard-caption">Independent strength ratings from the latest completed season, with conference context and links into the schedule.</p>
        <RatingsTable ratings={overview.ratings} />
      </section>
      <section className="dashboard-section" aria-labelledby="football-players">
        <div className="dashboard-section-heading"><div><span className="eyebrow">03 / PLAYER STATS</span><h2 id="football-players">Production leaders</h2></div><Link href="/football/players/">Full player table →</Link></div>
        <p className="dashboard-caption">Ranked {completedPlayerSeason} passing, rushing and receiving production by total EPA with the underlying volume visible.</p>
        <PlayerTable players={players} season={completedPlayerSeason} />
      </section>
    </div>
    <section className="dashboard-section" aria-labelledby="football-events">
      <div className="dashboard-section-heading"><div><span className="eyebrow">04 / DEFENSE &amp; SPECIALISTS</span><h2 id="football-events">Pressure and field position</h2></div><Link href="/football/events/">Full event notebook →</Link></div>
      <p className="dashboard-caption">Current {overview.season} event leaders. The season is partial; records stay tied to the recorded name and team until a player identity is verified.</p>
      <EventLeadersTable editions={eventEditions} />
    </section>
    <section className="dashboard-section dashboard-links" aria-labelledby="football-drilldowns">
      <div className="dashboard-section-heading"><div><span className="eyebrow">05 / DRILL DOWN</span><h2 id="football-drilldowns">More numbers</h2></div></div>
      <div className="dashboard-link-grid"><Link href="/football/events/"><strong>Defense &amp; specialists</strong><span>Sacks, takeaways, kicking, punting and return records</span><b>→</b></Link><Link href="/football/efficiency/"><strong>Efficiency</strong><span>Team rates, success and opponent production</span><b>→</b></Link><Link href="/football/recruiting/"><strong>Recruiting</strong><span>Classes, roster movement and returning production</span><b>→</b></Link><Link href="/football/evaluation/"><strong>Model record</strong><span>Holdout accuracy, calibration and forecast history</span><b>→</b></Link></div>
    </section>
    <p className="dashboard-updated">Board updated {date(overview.generated_at)} · {overview.coverage.box_rows.toLocaleString()} player box-score records in the current football edition.</p>
  </div>;
}
