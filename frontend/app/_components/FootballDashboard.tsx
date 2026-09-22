import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { Game, Overview } from "../_lib/data";
import { getOverview } from "../_lib/data";
import { date, fmt } from "../_lib/format";
import LiveFootballDashboardForecastTable from "./LiveFootballDashboardForecastTable";
import LiveFootballForecastStatus from "./LiveFootballForecastStatus";
import LiveFootballMarketStatus from "./LiveFootballMarketStatus";
import DashboardExportButton from "./DashboardExportButton";
import { footballDivisionCoverage } from "../_lib/football-coverage";
import {
  aggregateLowerFootballPlayers,
  lowerFootballCategoryDefinition,
  type LowerFootballCategory,
  type LowerFootballRawRow,
} from "../_lib/football-lower-player-view";

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
  team_id: string;
  name: string;
  team: string;
  conference: string;
  division: string;
  production: Record<string, Production>;
};

type ObservedLowerPlayerRow = {
  athlete_id?: string | null;
  team_id?: string | null;
  division?: string | null;
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

type MarketBenchmark = {
  generated_at: string;
  season: number;
  coverage: {
    evaluation_games: number;
    market_games: number;
    pregame_market_games: number;
  };
  metrics: {
    model: { margin_mae: number | null; winner_accuracy: number | null };
    archived_line: { margin_mae: number | null; winner_accuracy: number | null };
  };
};

function getPlayers(season: number) {
  const file = path.join(process.cwd(), "public/data/football", `players-${season - 1}.json`);
  if (!fs.existsSync(file)) return [] as Player[];
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { players?: Player[] };
  return data.players || [];
}

function getObservedLowerPlayers() {
  const file = path.join(process.cwd(), "public/data/football/lower-division-player-stats-2026.json");
  if (!fs.existsSync(file)) return [] as Array<{ id: string; team_id: string; division: string }>;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { rows?: ObservedLowerPlayerRow[] };
    return (data.rows || [])
      .filter((row): row is { athlete_id: string; team_id: string; division: string } => typeof row.athlete_id === "string" && typeof row.team_id === "string" && typeof row.division === "string")
      .map((row) => ({ id: row.athlete_id, team_id: row.team_id, division: row.division }));
  } catch {
    return [] as Array<{ id: string; team_id: string; division: string }>;
  }
}

type LowerFootballArchive = {
  generated_at?: string;
  coverage?: {
    players_by_division?: Record<string, number>;
    rows_by_division?: Record<string, number>;
  };
  rows?: LowerFootballRawRow[];
};

function getLowerFootballArchive(): LowerFootballArchive | null {
  const file = path.join(process.cwd(), "public/data/football/lower-division-player-stats-2026.json");
  if (!fs.existsSync(file)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as LowerFootballArchive;
    return Array.isArray(value.rows) ? value : null;
  } catch {
    return null;
  }
}

function getEventEditions(season: number) {
  const file = path.join(process.cwd(), "public/data/football/events.json");
  if (!fs.existsSync(file)) return [] as EventEdition[];
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { editions?: EventEdition[] };
  return (data.editions || []).filter((edition) => edition.season === season);
}

function getMarketBenchmark() {
  const file = path.join(process.cwd(), "public/data/football/market-benchmark.json");
  if (!fs.existsSync(file)) return null as MarketBenchmark | null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as MarketBenchmark;
}

function RatingsTable({ ratings }: { ratings: Overview["ratings"] }) {
  return <div className="dashboard-table-wrap">
    <table className="data-table dashboard-table">
      <thead><tr><th>#</th><th>Program</th><th>Conference</th><th className="numeric">Strength</th></tr></thead>
      <tbody>{ratings.slice(0, 24).map((team) => <tr key={team.id}>
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
    // Keep eight leaders per role visible on the landing board so the
    // football-first dashboard exposes a useful cohort before drill-down.
    .slice(0, 8));
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

const lowerLeaderCategories = ["passing", "rushing", "receiving"] as const satisfies readonly LowerFootballCategory[];

function LowerDivisionPlayerTable({ archive, division }: { archive: LowerFootballArchive; division: "d2" | "d3" }) {
  const rows = lowerLeaderCategories.flatMap((category) => {
    const definition = lowerFootballCategoryDefinition(category);
    return aggregateLowerFootballPlayers(archive.rows || [], division, category)
      .slice(0, 4)
      .map((player, rank) => ({ player, category, definition, rank: rank + 1 }));
  });
  return <section className="dashboard-section" aria-labelledby={`football-${division}-players`}>
    <div className="dashboard-section-heading">
      <div><span className="eyebrow">{division.toUpperCase()} / OBSERVED PLAYER STATS</span><h2 id={`football-${division}-players`}>Production leaders</h2></div>
      <Link href={`/football/players/?division=${division.slice(1)}`}>Open full D{division.slice(1)} table →</Link>
    </div>
    <p className="dashboard-caption">Exact publisher athlete and team IDs aggregated from retained {division.toUpperCase()} game summaries. These are observed production totals; missing games and categories remain unavailable.</p>
    <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table">
        <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Role</th><th className="numeric">GP</th><th className="numeric">{rows.length ? "Production" : "Value"}</th></tr></thead>
        <tbody>{rows.map(({ player, category, definition, rank }) => <tr key={`${division}-${category}-${player.athlete_id}-${player.team_id}`}>
          <td className="rank-number">{rank}</td>
          <th scope="row">{player.athlete}<small>{player.athlete_id}{player.position ? ` · ${player.position}` : ""}</small></th>
          <td>{player.team}<small>{player.team_id}</small></td>
          <td>{definition.label}</td>
          <td className="numeric">{player.games}</td>
          <td className="numeric"><strong>{fmt(player.primary, 0)}</strong><small>{definition.metric}</small></td>
        </tr>)}</tbody>
      </table>
    </div>
    {!rows.length ? <p className="empty">No observed {division.toUpperCase()} player rows are available.</p> : null}
  </section>;
}

function EventLeadersTable({ editions }: { editions: EventEdition[] }) {
  const rows = editions.flatMap((edition) =>
    [
      ...(edition.dataset === "defense" ? ["sacks", "interceptions"] : []),
      ...(edition.dataset === "specialists" ? ["field_goals", "punts"] : []),
    ].flatMap((metric) =>
      (edition.leaders[metric] || []).slice(0, 6).map((leader) => ({
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
  const lowerFootballArchive = getLowerFootballArchive();
  const divisionCoverage = footballDivisionCoverage(overview.upcoming, players, undefined, getObservedLowerPlayers());
  const forecasts = overview.upcoming.filter((game) => game.prediction);
  const completedPlayerSeason = overview.season - 1;
  const eventEditions = getEventEditions(overview.season);
  const marketBenchmark = getMarketBenchmark();
  const teamExportRows = overview.ratings.map((team) => [
    overview.season,
    team.rank,
    team.name,
    team.id,
    team.conference,
    team.rating,
  ] as (string | number | null)[]);
  const playerExportRows = players.flatMap((player) =>
    ["passing", "rushing", "receiving"].flatMap((category) => {
      const stats = player.production[category];
      if (!stats) return [];
      return [[
        completedPlayerSeason,
        player.id,
        player.name,
        player.team,
        player.conference,
        player.division,
        category,
        stats.rank,
        stats.games,
        stats.plays,
        stats.yards,
        stats.yards_per_play,
        stats.epa,
        stats.epa_per_play,
        stats.touchdowns,
      ] as (string | number | null)[]];
    }),
  );
  const eventExportRows = eventEditions.flatMap((edition) =>
    Object.entries(edition.leaders).flatMap(([metric, leaders]) => leaders.map((leader) => [
      edition.season,
      edition.dataset,
      metric,
      leader.player_name,
      leader.team,
      leader.division,
      leader.records,
      leader.games,
      leader.value,
    ] as (string | number | null)[])),
  );
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
        <span>D1 game forecasts</span>
        <small>D2 and D3 forecasts are published on the exact-division matchup desk.</small>
        <div className="dashboard-model-rule" />
        <div><b>{fmt(overview.model.evaluation.winner_accuracy * 100)}%</b><span>held-out winner accuracy</span></div>
        <div><b>{fmt(overview.model.evaluation.margin_mae)} pts</b><span>held-out margin error</span></div>
        <div><b>{overview.coverage.upcoming_games ? fmt((forecasts.length / overview.coverage.upcoming_games) * 100) : "—"}%</b><span>upcoming slate covered</span></div>
        <small>{fmt(Math.max(0, overview.model.evaluation.baseline_margin_mae - overview.model.evaluation.margin_mae))} pts lower margin error than the baseline on holdout games.</small>
      </div>
    </section>
    <LiveFootballForecastStatus />
    <LiveFootballMarketStatus />
    <div className="dashboard-strip">
      <div><strong>{overview.ratings.length}</strong><span>Rated teams</span></div>
      <div><strong>{players.length.toLocaleString()}</strong><span>Player profiles</span></div>
      <div><strong>{overview.coverage.upcoming_games.toLocaleString()}</strong><span>Upcoming games</span></div>
      <div><strong>{overview.coverage.ncaa_player_stats_rows.toLocaleString()}</strong><span>Player stat rows</span></div>
    </div>
    <section className="dashboard-section" aria-labelledby="football-scope">
      <div className="dashboard-section-heading"><div><span className="eyebrow">ARCHIVE SCOPE</span><h2 id="football-scope">Know what the board covers.</h2></div><Link href="/research/coverage/">Coverage details →</Link></div>
      <p className="dashboard-caption">The football edition contains published FBS, FCS, Division II and Division III schedule rows. Player counts are unique source athlete IDs in the {completedPlayerSeason} identified player edition; game counts are {overview.season} upcoming games involving each division. A cross-division game appears in both rows, and games without a model prediction stay visible.</p>
      <div className="dashboard-table-wrap">
        <table className="data-table dashboard-table">
          <thead><tr><th>Imported division</th><th className="numeric">Players</th><th className="numeric">Team rows</th><th className="numeric">Upcoming games</th><th className="numeric">Forecasts</th><th className="numeric">No forecast</th></tr></thead>
          <tbody>{divisionCoverage.map((row) => <tr key={row.division}>
            <th scope="row">{row.division.toUpperCase()}<small>{row.player_stats_available ? `${row.player_records.toLocaleString()} player records in the edition` : row.observed_player_stats_available ? `${row.observed_player_records.toLocaleString()} rows in the observed game archive` : "Player edition unavailable"}</small></th>
            <td className="numeric">{row.player_stats_available ? row.players.toLocaleString() : row.observed_player_stats_available ? row.observed_players.toLocaleString() : "—"}</td>
            <td className="numeric">{row.teams.toLocaleString()}</td>
            <td className="numeric">{row.upcoming_games.toLocaleString()}</td>
            <td className="numeric"><strong>{row.forecast_games.toLocaleString()}</strong></td>
            <td className="numeric">{row.games_without_forecast.toLocaleString()}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="note">Division II and Division III schedule coverage, exact-division ratings, forecasts, and an observed player production archive are available. The player archive is built from retained game summaries and is separate from the national player-stat edition; missing games and categories remain unavailable. The primary board covers FBS-versus-FBS games, while the matchup desk publishes independently gated exact-division D2/D3 ratings and forecasts.</p>
    </section>
    <section className="dashboard-section" aria-labelledby="football-games">
      <div className="dashboard-section-heading"><div><span className="eyebrow">01 / GAME CENTER</span><h2 id="football-games">Upcoming games &amp; predictions</h2></div><Link href="/football/matchups/">View all {forecasts.length.toLocaleString()} forecasts →</Link></div>
      <p className="dashboard-caption">Every row has a Silvermine score projection, win probability, margin, calibrated range and total. The held-out fit column shows the historical outcome rate for the exact probability band when the edition has a matching D1 calibration cohort. Historical market comparisons stay on the matchup desk when an eligible quote is available.</p>
      <LiveFootballDashboardForecastTable initialGames={forecasts} model={overview.model} expectedModelId={overview.model.id} />
    </section>
    <div className="dashboard-two-col">
      <section className="dashboard-section" aria-labelledby="football-teams">
        <div className="dashboard-section-heading"><div><span className="eyebrow">02 / TEAM STATS</span><h2 id="football-teams">Power ratings</h2></div><div className="button-row"><DashboardExportButton sport="football" kind="teams" season={overview.season} headers={["Season", "Rank", "Team", "Team ID", "Conference", "Strength"]} rows={teamExportRows} /><Link href="/football/ratings/">Full team table →</Link></div></div>
        <p className="dashboard-caption">Top 24 independent strength ratings from the latest completed season, with conference context and links into the schedule.</p>
        <RatingsTable ratings={overview.ratings} />
      </section>
      <section className="dashboard-section" aria-labelledby="football-players">
        <div className="dashboard-section-heading"><div><span className="eyebrow">03 / PLAYER STATS</span><h2 id="football-players">Production leaders</h2></div><div className="button-row"><DashboardExportButton sport="football" kind="players" season={completedPlayerSeason} headers={["Season", "Player ID", "Player", "Team", "Conference", "Division", "Role", "Rank", "Games", "Plays", "Yards", "Yards/play", "EPA", "EPA/play", "Touchdowns"]} rows={playerExportRows} /><Link href="/football/players/">Full player table →</Link></div></div>
        <p className="dashboard-caption">Eight ranked {completedPlayerSeason} passing, rushing and receiving leaders per role, with the underlying volume visible.</p>
        <PlayerTable players={players} season={completedPlayerSeason} />
      </section>
    </div>
    {lowerFootballArchive ? <div className="dashboard-two-col">
      <LowerDivisionPlayerTable archive={lowerFootballArchive} division="d2" />
      <LowerDivisionPlayerTable archive={lowerFootballArchive} division="d3" />
    </div> : null}
    <section className="dashboard-section" aria-labelledby="football-events">
      <div className="dashboard-section-heading"><div><span className="eyebrow">04 / DEFENSE &amp; SPECIALISTS</span><h2 id="football-events">Pressure and field position</h2></div><div className="button-row"><DashboardExportButton sport="football" kind="events" season={overview.season} headers={["Season", "Dataset", "Stat", "Player", "Team", "Division", "Records", "Games", "Value"]} rows={eventExportRows} /><Link href="/football/events/">Full event notebook →</Link></div></div>
      <p className="dashboard-caption">Six current {overview.season} leaders for each retained defensive and specialist event. The season is partial; records stay tied to the recorded name and team until a player identity is verified.</p>
      <EventLeadersTable editions={eventEditions} />
    </section>
    {marketBenchmark ? (
      <section className="dashboard-section" aria-labelledby="football-market-check">
        <div className="dashboard-section-heading"><div><span className="eyebrow">05 / MARKET CHECK</span><h2 id="football-market-check">Model beside the archived line</h2></div><Link href="/research/scorecard/?sport=football">Full scorecard →</Link></div>
        <p className="dashboard-caption">A retrospective {marketBenchmark.season} holdout comparison makes the model’s margin and winner accuracy easy to audit. The archived line is reference evidence; only timestamped pregame captures enter prospective market evaluation.</p>
        <div className="dashboard-strip">
          <div><strong>{marketBenchmark.coverage.market_games.toLocaleString()}</strong><span>Games with archived lines</span></div>
          <div><strong>{marketBenchmark.coverage.pregame_market_games.toLocaleString()}</strong><span>Verified pregame captures</span></div>
          <div><strong>{fmt(marketBenchmark.metrics.model.margin_mae)}</strong><span>Model margin MAE</span></div>
          <div><strong>{fmt(marketBenchmark.metrics.archived_line.margin_mae)}</strong><span>Archived-line margin MAE</span></div>
        </div>
        <div className="dashboard-table-wrap">
          <table className="data-table dashboard-table">
            <thead><tr><th>Reference</th><th className="numeric">Winner accuracy</th><th className="numeric">Margin MAE</th><th>Use</th></tr></thead>
            <tbody>
              <tr><th scope="row">Silvermine model</th><td className="numeric">{marketBenchmark.metrics.model.winner_accuracy == null ? "—" : `${fmt(marketBenchmark.metrics.model.winner_accuracy * 100)}%`}</td><td className="numeric">{fmt(marketBenchmark.metrics.model.margin_mae)} pts</td><td>Prospective forecast candidate</td></tr>
              <tr><th scope="row">Archived line</th><td className="numeric">{marketBenchmark.metrics.archived_line.winner_accuracy == null ? "—" : `${fmt(marketBenchmark.metrics.archived_line.winner_accuracy * 100)}%`}</td><td className="numeric">{fmt(marketBenchmark.metrics.archived_line.margin_mae)} pts</td><td>Retrospective reference only</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    ) : null}
    <section className="dashboard-section dashboard-links" aria-labelledby="football-drilldowns">
      <div className="dashboard-section-heading"><div><span className="eyebrow">06 / DRILL DOWN</span><h2 id="football-drilldowns">More numbers</h2></div></div>
      <div className="dashboard-link-grid"><Link href="/football/events/"><strong>Defense &amp; specialists</strong><span>Sacks, takeaways, kicking, punting and return records</span><b>→</b></Link><Link href="/football/efficiency/"><strong>Efficiency</strong><span>Team rates, success and opponent production</span><b>→</b></Link><Link href="/football/recruiting/"><strong>Recruiting</strong><span>Classes, roster movement and returning production</span><b>→</b></Link><Link href="/football/evaluation/"><strong>Model record</strong><span>Holdout accuracy, calibration and forecast history</span><b>→</b></Link></div>
    </section>
    <p className="dashboard-updated">Board updated {date(overview.generated_at)} · {overview.coverage.box_rows.toLocaleString()} player box-score records in the current football edition.</p>
  </div>;
}
