import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { getBasketball } from "../_lib/basketball-data";
import {
  topBasketballLeaders,
  type BasketballLeaderMetric,
  type BasketballLeaderPlayer,
} from "../_lib/basketball-leaders";
import type { BBGame, BBTeam } from "../_lib/basketball-types";
import { date, fmt, kick } from "../_lib/format";
import LiveBasketballForecastStatus from "./LiveBasketballForecastStatus";

function getPlayers(season: number) {
  // The overview edition already contains the latest complete player file in
  // the static release. Keep the dashboard server-rendered and deterministic.
  const file = path.join(process.cwd(), "public/data/basketball/history", `players-${season - 1}.json`);
  if (!fs.existsSync(file)) return [] as BasketballLeaderPlayer[];
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { players?: BasketballLeaderPlayer[] };
  return data.players || [];
}

const latestTip = (game: BBGame) =>
  game.source_time_valid && game.source_start ? kick(game.source_start) : game.time_tbd ? "Time TBD" : kick(game.starts_at);

const predictionFor = (game: BBGame) => game.prediction || game.fallback_prediction;

function modelLabel(game: BBGame) {
  return game.prediction ? "SILVERMINE MODEL" : "BASELINE MODEL";
}

function TeamTable({ teams }: { teams: BBTeam[] }) {
  return (
    <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table">
        <thead>
          <tr><th>#</th><th>Team</th><th className="numeric">W–L</th><th className="numeric">Adj O</th><th className="numeric">Adj D</th><th className="numeric">NET</th><th className="numeric">PACE</th><th className="numeric">SOS</th></tr>
        </thead>
        <tbody>
          {teams.slice(0, 12).map((team) => (
            <tr key={team.id}>
              <td className="rank-number">{team.rank}</td>
              <th scope="row"><Link href={`/basketball/programs/${encodeURIComponent(team.id)}/`}>{team.name}</Link></th>
              <td className="numeric">{team.wins}–{Math.max(0, team.games - team.wins)}</td>
              <td className="numeric">{fmt(team.adj_off)}</td>
              <td className="numeric">{fmt(team.adj_def)}</td>
              <td className="numeric"><strong>{fmt(team.adj_net)}</strong></td>
              <td className="numeric">{fmt(team.adj_tempo)}</td>
              <td className="numeric">{team.sos == null ? "—" : fmt(team.sos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlayerTable({ players, season }: { players: BasketballLeaderPlayer[]; season: number }) {
  const rows = topBasketballLeaders(players, "ppg", 12);
  return (
    <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table">
        <thead>
          <tr><th>#</th><th>Player</th><th>Team</th><th className="numeric">GP</th><th className="numeric">MPG</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">SPG</th><th className="numeric">BPG</th><th className="numeric">eFG%</th><th className="numeric">TS%</th><th className="numeric">TO%</th></tr>
        </thead>
        <tbody>
          {rows.map((player) => (
            <tr key={`${player.id}-${player.team}`}>
              <td className="rank-number">{player.rank}</td>
              <th scope="row"><Link href={`/basketball/player/?id=${encodeURIComponent(player.id)}&season=${season}`}>{player.name}</Link><small>{player.position || "—"}</small></th>
              <td>{player.team}</td>
              <td className="numeric">{player.games}</td>
              <td className="numeric">{player.minutes && player.games ? fmt(player.minutes / player.games) : "—"}</td>
              <td className="numeric"><strong>{fmt(player.ppg)}</strong></td>
              <td className="numeric">{fmt(player.rpg)}</td>
              <td className="numeric">{fmt(player.apg)}</td>
              <td className="numeric">{fmt(player.spg)}</td>
              <td className="numeric">{fmt(player.bpg)}</td>
              <td className="numeric">{player.efg == null ? "—" : `${fmt(player.efg * 100)}%`}</td>
              <td className="numeric">{player.ts == null ? "—" : `${fmt(player.ts * 100)}%`}</td>
              <td className="numeric">{player.tov_rate == null ? "—" : `${fmt(player.tov_rate * 100)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ForecastTable({ games }: { games: BBGame[] }) {
  const rows = games.filter((game) => predictionFor(game)).slice(0, 12);
  return (
    <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table forecast-table">
        <thead>
          <tr><th>Game</th><th>Tip</th><th>Model</th><th className="numeric">Projected</th><th className="numeric">Home win</th><th className="numeric">Margin</th><th className="numeric">Total</th></tr>
        </thead>
        <tbody>
          {rows.map((game) => {
            const prediction = predictionFor(game)!;
            return (
              <tr key={game.id}>
                <th scope="row"><Link href={`/basketball/matchups/?game=${encodeURIComponent(game.id)}`}><strong>{game.away_name}</strong><small>at {game.home_name}</small></Link></th>
                <td>{date(game.starts_at)}<small>{latestTip(game)}</small></td>
                <td><span className={`model-tag ${game.prediction ? "primary" : "baseline"}`}>{modelLabel(game)}</span></td>
                <td className="numeric"><strong>{fmt(prediction.away_score)}–{fmt(prediction.home_score)}</strong></td>
                <td className="numeric"><strong>{fmt(prediction.home_win_probability * 100)}%</strong></td>
                <td className="numeric">{prediction.home_margin >= 0 ? "+" : ""}{fmt(prediction.home_margin)}</td>
                <td className="numeric">{fmt(prediction.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DataCoverageTable({ overview }: { overview: ReturnType<typeof getBasketball> }) {
  const rows = (overview.coverage.datasets || [])
    .filter((dataset) => ["player_box", "ncaa_player_box", "player_season", "ncaa_player_season", "rosters", "schedule", "team_box", "publisher_ratings"].includes(dataset.key))
    .sort((a, b) => b.rows - a.rows)
    .slice(0, 8);
  const captured = (value: string | null) => value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "—";
  return (
    <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table">
        <thead>
          <tr><th>Dataset</th><th className="numeric">Rows</th><th className="numeric">Seasons</th><th className="numeric">Latest data</th><th className="numeric">Captures</th></tr>
        </thead>
        <tbody>
          {rows.map((dataset) => (
            <tr key={dataset.key}>
              <th scope="row">{dataset.label}<small>{dataset.key === "player_box" ? "Game-level player production" : dataset.key === "ncaa_player_box" ? "Archived player game production" : dataset.key === "player_season" ? "Season player aggregates" : dataset.key === "ncaa_player_season" ? "Archived player aggregates" : dataset.key === "rosters" ? "Current roster records" : dataset.key === "schedule" ? "Game schedule and finals" : dataset.key === "team_box" ? "Game-level team production" : dataset.key === "publisher_ratings" ? "Published team ratings" : "Retained dataset"}</small></th>
              <td className="numeric"><strong>{dataset.rows.toLocaleString()}</strong></td>
              <td className="numeric">{dataset.seasons.length}</td>
              <td className="numeric">{captured(dataset.latest_source_at)}</td>
              <td className="numeric">{dataset.source_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StatsDashboard() {
  const overview = getBasketball();
  const players = getPlayers(overview.season);
  const forecasts = overview.upcoming.filter((game) => predictionFor(game));
  const latestSeason = overview.season - 1;
  const metrics: BasketballLeaderMetric[] = ["ppg", "rpg", "apg", "ts"];
  const leaderCounts = metrics.map((metric) => ({ metric, count: topBasketballLeaders(players, metric, 100000).length }));
  return (
    <div className="stats-dashboard">
      <div className="dashboard-kicker"><span>MEN&apos;S COLLEGE BASKETBALL</span><span>{overview.label} / LIVE BOARD</span></div>
      <section className="dashboard-hero">
        <div>
          <div className="eyebrow">Stats, ratings, games, predictions</div>
          <h1>The numbers<br /><em>on the board.</em></h1>
          <p>Team strength, player production and every available 2026–27 game forecast in one fast view.</p>
          <div className="hero-actions"><Link className="button" href="/basketball/matchups/">All upcoming games ↗</Link><Link className="hero-link" href="/basketball/ncaa-rankings/">Player rankings →</Link><Link className="hero-link" href="/basketball/ratings/">Team ratings →</Link></div>
        </div>
        <div className="dashboard-model-card">
          <span className="model-tag primary">SILVERMINE MODEL</span>
          <strong>{overview.coverage.forecast_games.toLocaleString()}</strong>
          <span>primary game forecasts</span>
          {overview.coverage.baseline_estimate_games ? <small>{overview.coverage.baseline_estimate_games.toLocaleString()} baseline rows are labeled in the table.</small> : null}
          <div className="dashboard-model-rule" />
          <div><b>{fmt(overview.model.evaluation.winner_accuracy * 100)}%</b><span>held-out winner accuracy</span></div>
          <div><b>{fmt(overview.model.evaluation.margin_mae)} pts</b><span>held-out margin error</span></div>
        </div>
      </section>
      <div className="dashboard-strip">
        <div><strong>{overview.ratings.length}</strong><span>Rated teams</span></div>
        <div><strong>{players.length.toLocaleString()}</strong><span>Player stat rows</span></div>
        <div><strong>{overview.coverage.upcoming_games.toLocaleString()}</strong><span>Upcoming games</span></div>
        <div><strong>{overview.coverage.player_box_rows.toLocaleString()}</strong><span>Player box records</span></div>
      </div>
      <LiveBasketballForecastStatus />
      <section className="dashboard-section" aria-labelledby="dashboard-games">
        <div className="dashboard-section-heading"><div><span className="eyebrow">01 / GAME CENTER</span><h2 id="dashboard-games">Upcoming games &amp; predictions</h2></div><Link href="/basketball/matchups/">View all {forecasts.length.toLocaleString()} forecasts →</Link></div>
        <p className="dashboard-caption">Every row below has a Silvermine score projection, win probability, margin and total. Baseline rows are labeled when a team falls outside the trained field.</p>
        <ForecastTable games={forecasts} />
      </section>
      <div className="dashboard-two-col">
        <section className="dashboard-section" aria-labelledby="dashboard-teams">
          <div className="dashboard-section-heading"><div><span className="eyebrow">02 / TEAM STATS</span><h2 id="dashboard-teams">Power ratings</h2></div><Link href="/basketball/ratings/">Full team table →</Link></div>
          <p className="dashboard-caption">Latest completed-season team stats: adjusted offense, adjusted defense, net rating, pace and schedule strength.</p>
          <TeamTable teams={overview.ratings} />
        </section>
        <section className="dashboard-section" aria-labelledby="dashboard-players">
          <div className="dashboard-section-heading"><div><span className="eyebrow">03 / PLAYER STATS</span><h2 id="dashboard-players">Scoring leaders</h2></div><Link href="/basketball/players/">Full player table →</Link></div>
          <p className="dashboard-caption">Qualified {latestSeason - 1}–{String(latestSeason).slice(-2)} production with the core box-score line, defensive events and shooting efficiency.</p>
          <PlayerTable players={players} season={latestSeason} />
        </section>
      </div>
      <section className="dashboard-section" aria-labelledby="dashboard-coverage">
        <div className="dashboard-section-heading"><div><span className="eyebrow">04 / DATA COVERAGE</span><h2 id="dashboard-coverage">What is in the warehouse</h2></div><Link href="/research/coverage/">Open coverage checks →</Link></div>
        <p className="dashboard-caption">Player boxes, archives, rosters, schedules and ratings retained for analysis. “Latest data” is the newest captured row for each dataset.</p>
        <DataCoverageTable overview={overview} />
      </section>
      <section className="dashboard-section dashboard-links" aria-labelledby="dashboard-drilldowns">
        <div className="dashboard-section-heading"><div><span className="eyebrow">05 / DRILL DOWN</span><h2 id="dashboard-drilldowns">More numbers</h2></div></div>
        <div className="dashboard-link-grid">
          <Link href="/basketball/ncaa-player-box/"><strong>Game logs</strong><span>Every retained player box score and split</span><b>→</b></Link>
          <Link href="/basketball/ncaa-shooting/"><strong>Shooting lab</strong><span>Shot profile, zones and field-goal attempts</span><b>→</b></Link>
          <Link href="/basketball/lineups/"><strong>Lineups</strong><span>Five-player stints and net performance</span><b>→</b></Link>
          <Link href="/basketball/recruiting/"><strong>Recruiting</strong><span>Rankings, roster movement and fit</span><b>→</b></Link>
        </div>
      </section>
      <p className="dashboard-updated">Board updated {date(overview.generated_at)} · {leaderCounts.reduce((sum, item) => sum + item.count, 0).toLocaleString()} qualified metric records available in the player file.</p>
    </div>
  );
}
