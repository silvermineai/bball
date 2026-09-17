import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { getBasketball, getRosterModel, getRosters } from "../_lib/basketball-data";
import {
  topBasketballLeaders,
  type BasketballLeaderMetric,
  type BasketballLeaderPlayer,
} from "../_lib/basketball-leaders";
import type { BBGame, BBRoster, BBTeam } from "../_lib/basketball-types";
import { date, fmt } from "../_lib/format";
import { rankPlayerProfiles } from "../_lib/player-index-view";
import { priorProductionIndex } from "../_lib/roster-observations";
import LiveBasketballForecastStatus from "./LiveBasketballForecastStatus";
import LiveBasketballMarketStatus from "./LiveBasketballMarketStatus";
import LiveBasketballProspectLeaders from "./LiveBasketballProspectLeaders";
import LiveNationalPlayerTable, { type NationalPlayerRow } from "./LiveNationalPlayerTable";
import LiveTeamProductionTable from "./LiveTeamProductionTable";
import LiveDashboardForecastTable from "./LiveDashboardForecastTable";

function getPlayers(season: number) {
  // The overview edition already contains the latest complete player file in
  // the static release. Keep the dashboard server-rendered and deterministic.
  const file = path.join(process.cwd(), "public/data/basketball/history", `players-${season - 1}.json`);
  if (!fs.existsSync(file)) return [] as BasketballLeaderPlayer[];
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { players?: BasketballLeaderPlayer[] };
  return data.players || [];
}

type RecruitingPerson = {
  key: string;
  name: string;
  team_id: string;
  category: string;
  previous_program?: string | null;
  stats?: {
    games?: number | null;
    ppg?: number | null;
    rpg?: number | null;
    apg?: number | null;
    ts?: number | null;
  } | null;
};

type RecruitingRelease = {
  season: number;
  reviewed_at: string;
  coverage: { programs: number; players: number; events: number; historical_links: number };
  programs: Array<{ id: string; name: string }>;
  people: RecruitingPerson[];
};

function getRecruiting() {
  const file = path.join(process.cwd(), "public/data/basketball/recruiting.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as RecruitingRelease;
}

type ImpactPlayer = {
  player_id: string;
  player: string;
  team: string;
  orapm: number | null;
  drapm: number | null;
  rapm_net: number | null;
  off_poss: number | null;
  def_poss: number | null;
  qualified?: boolean;
  rank?: number | null;
};

type ValueLeader = {
  id: string;
  name: string;
  team_id: string;
  team: string;
  minutes: number;
  value: number | null;
  display?: string;
  rank?: number | null;
};

function getImpact(season: number) {
  const file = path.join(process.cwd(), "public/data/basketball", `impact-${season - 1}.json`);
  if (!fs.existsSync(file)) return [] as ImpactPlayer[];
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { players?: ImpactPlayer[] };
  return data.players || [];
}

function getValueLeaders(season: number) {
  const file = path.join(process.cwd(), "public/data/basketball/publisher-value-leaders.json");
  if (!fs.existsSync(file)) return [] as ValueLeader[];
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
    season?: number;
    metrics?: Array<{ key: string; leaders?: ValueLeader[] }>;
  };
  if (data.season !== season) return [] as ValueLeader[];
  return data.metrics?.find((metric) => metric.key === "box_bpm")?.leaders || [];
}

function getNationalPlayers(season: number) {
  const file = path.join(process.cwd(), "public/data/basketball/ncaa-individual.json");
  if (!fs.existsSync(file)) return [] as NationalPlayerRow[];
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { season?: number; players?: NationalPlayerRow[] };
  if (data.season !== season) return [] as NationalPlayerRow[];
  return (data.players || [])
    .filter((player) => player.division === 1 && player.ppg != null)
    .sort((a, b) => (b.ppg ?? -1) - (a.ppg ?? -1) || a.name.localeCompare(b.name))
    .slice(0, 10);
}

const predictionFor = (game: BBGame) => game.prediction || game.fallback_prediction;

function TeamTable({ teams }: { teams: BBTeam[] }) {
  const pct = (value: number | null | undefined) => value == null ? "—" : `${fmt(value * 100)}%`;
  return (
    <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table">
        <thead>
          <tr><th>#</th><th>Team</th><th className="numeric">W–L</th><th className="numeric">Adj O</th><th className="numeric">Adj D</th><th className="numeric">NET</th><th className="numeric">PACE</th><th className="numeric">SOS</th><th className="numeric">eFG%</th><th className="numeric">TO%</th><th className="numeric">ORB%</th><th className="numeric">FTR</th></tr>
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
              <td className="numeric">{pct(team.efg)}</td>
              <td className="numeric">{pct(team.tov_rate)}</td>
              <td className="numeric">{pct(team.orb_rate)}</td>
              <td className="numeric">{pct(team.ft_rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlayerTable({ players, season }: { players: BasketballLeaderPlayer[]; season: number }) {
  // Keep the landing table ordered by the explainable all-around index.
  // National leader cards below preserve single-stat leaderboards.
  // Use a deterministic display key because the compact dashboard release
  // does not need to expose the underlying provider team identifier.
  type DashboardProfilePlayer = BasketballLeaderPlayer & {
    team_id: string;
    spg: number | null;
    bpg: number | null;
    efg: number | null;
    tov_rate: number | null;
  };
  const profileRows = rankPlayerProfiles<DashboardProfilePlayer>(
    players.filter((player) => player.qualified).map((player) => ({
      ...player,
      team_id: `${player.id}:${player.team}`,
      spg: player.spg ?? null,
      bpg: player.bpg ?? null,
      efg: player.efg ?? null,
      tov_rate: player.tov_rate ?? null,
    })),
  );
  const profileByPlayer = new Map(
    profileRows.map((player) => [`${player.id}::${player.team}`, player]),
  );
  const rows = profileRows.filter((player) => player.profileScore != null).slice(0, 12);
  return (
    <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table">
        <thead>
          <tr><th>#</th><th>Player</th><th>Team</th><th className="numeric">GP</th><th className="numeric">MPG</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">OR/G</th><th className="numeric">DR/G</th><th className="numeric">APG</th><th className="numeric">SPG</th><th className="numeric">BPG</th><th className="numeric">TO/G</th><th className="numeric">eFG%</th><th className="numeric">3P%</th><th className="numeric">FT rate</th><th className="numeric">TS%</th><th className="numeric">TO%</th><th className="numeric">Index</th></tr>
        </thead>
        <tbody>
          {rows.map((player) => {
            const profile = profileByPlayer.get(`${player.id}::${player.team}`);
            return (
            <tr key={`${player.id}-${player.team}`}>
              <td className="rank-number">{player.profileRank ?? "—"}</td>
              <th scope="row"><Link href={`/basketball/player/?id=${encodeURIComponent(player.id)}&season=${season}`}>{player.name}</Link><small>{player.position || "—"}</small></th>
              <td>{player.team}</td>
              <td className="numeric">{player.games}</td>
              <td className="numeric">{player.minutes && player.games ? fmt(player.minutes / player.games) : "—"}</td>
              <td className="numeric"><strong>{fmt(player.ppg)}</strong></td>
              <td className="numeric">{fmt(player.rpg)}</td>
              <td className="numeric">{fmt(player.orpg)}</td>
              <td className="numeric">{fmt(player.drpg)}</td>
              <td className="numeric">{fmt(player.apg)}</td>
              <td className="numeric">{fmt(player.spg)}</td>
              <td className="numeric">{fmt(player.bpg)}</td>
              <td className="numeric">{fmt(player.topg)}</td>
              <td className="numeric">{player.efg == null ? "—" : `${fmt(player.efg * 100)}%`}</td>
              <td className="numeric">{player.three_pct == null ? "—" : `${fmt(player.three_pct * 100)}%`}</td>
              <td className="numeric">{player.ft_rate == null ? "—" : `${fmt(player.ft_rate * 100)}%`}</td>
              <td className="numeric">{player.ts == null ? "—" : `${fmt(player.ts * 100)}%`}</td>
              <td className="numeric">{player.tov_rate == null ? "—" : `${fmt(player.tov_rate * 100)}%`}</td>
              <td className="numeric">{profile?.profileScore == null ? "—" : fmt(profile.profileScore)}<small>{profile?.profileRank ? `#${profile.profileRank} all-around` : "Insufficient fields"}</small></td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getRosterLeaders() {
  const rosters = getRosters();
  const eligible = rosters.players.filter((player) => {
    const production = player.prior_production;
    return Boolean(production && production.games >= 5 && production.minutes >= 200);
  });
  const scores = priorProductionIndex(eligible);
  return eligible
    .map((player) => ({ player, score: scores.get(`${player.id}-${player.team_id}`)?.score ?? null }))
    .filter((row): row is { player: BBRoster; score: number } => row.score != null)
    .sort((a, b) => b.score - a.score || (b.player.prior_production?.minutes ?? 0) - (a.player.prior_production?.minutes ?? 0) || a.player.name.localeCompare(b.player.name))
    .slice(0, 12);
}

function RosterProductionTable({ rows }: { rows: ReturnType<typeof getRosterLeaders> }) {
  return (
    <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table">
        <thead><tr><th>#</th><th>Player</th><th>Program</th><th>Status</th><th className="numeric">MPG</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">TS%</th><th className="numeric">Box BPM</th><th className="numeric">Index</th></tr></thead>
        <tbody>{rows.map(({ player, score }, index) => {
          const production = player.prior_production;
          return <tr key={`${player.id}-${player.team_id}`}>
            <td className="rank-number">{index + 1}</td>
            <th scope="row"><Link href={`/basketball/player/?id=${encodeURIComponent(player.id)}&season=2026`}>{player.name}</Link><small>{player.position || "—"} · {player.class_year || "Class unavailable"}</small></th>
            <td><Link href={`/basketball/programs/${encodeURIComponent(player.team_id)}/`}>{player.team}</Link></td>
            <td>{player.status.replaceAll("_", " ")}</td>
            <td className="numeric">{fmt(production?.mpg)}</td>
            <td className="numeric"><strong>{fmt(production?.ppg)}</strong></td>
            <td className="numeric">{fmt(production?.rpg)}</td>
            <td className="numeric">{fmt(production?.apg)}</td>
            <td className="numeric">{production?.ts == null ? "—" : `${fmt(production.ts * 100)}%`}</td>
            <td className="numeric">{fmt(production?.box_bpm)}</td>
            <td className="numeric"><strong>{fmt(score, 1)}</strong><small>prior production index</small></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  );
}

const leaderCards: Array<{ metric: BasketballLeaderMetric; label: string; description: string; percent?: boolean }> = [
  { metric: "ppg", label: "Scoring", description: "points per game" },
  { metric: "rpg", label: "Rebounding", description: "rebounds per game" },
  { metric: "apg", label: "Playmaking", description: "assists per game" },
  { metric: "spg", label: "Steals", description: "steals per game" },
  { metric: "bpg", label: "Rim protection", description: "blocks per game" },
  { metric: "ts", label: "True shooting", description: "scoring efficiency", percent: true },
];

function LeaderCards({ players, season }: { players: BasketballLeaderPlayer[]; season: number }) {
  return (
    <div className="basketball-leader-grid">
      {leaderCards.map((card) => (
        <section className="paper-panel" key={card.metric}>
          <div className="eyebrow">{card.description}</div>
          <h3>{card.label}</h3>
          <div className="basketball-leader-list">
            {topBasketballLeaders(players, card.metric, 5).map((leader) => (
              <div className="basketball-leader-row" key={`${card.metric}-${leader.id}-${leader.team}`}>
                <span className="rank-number">{leader.rank}</span>
                <span>
                  <strong>
                    <Link href={`/basketball/player/?id=${encodeURIComponent(leader.id)}&season=${season}`}>{leader.name}</Link>
                  </strong>
                  <small>{leader.team}</small>
                </span>
                <strong className="numeric">
                  {fmt(leader.value * (card.percent ? 100 : 1))}{card.percent ? "%" : ""}
                </strong>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function RecruitingSnapshot({ release }: { release: RecruitingRelease }) {
  const programs = new Map(release.programs.map((program) => [program.id, program.name]));
  const ranked = release.people
    .filter((person) => person.stats?.ppg != null)
    .sort((a, b) => (b.stats?.ppg ?? -1) - (a.stats?.ppg ?? -1) || a.name.localeCompare(b.name))
    .slice(0, 8);
  return (
    <>
      <div className="dashboard-strip dashboard-recruiting-strip">
        <div><strong>{release.coverage.players.toLocaleString()}</strong><span>Recorded additions</span></div>
        <div><strong>{release.coverage.programs.toLocaleString()}</strong><span>Destination programs</span></div>
        <div><strong>{release.coverage.events.toLocaleString()}</strong><span>Dated recruiting events</span></div>
        <div><strong>{release.coverage.historical_links.toLocaleString()}</strong><span>Prior stat links</span></div>
      </div>
      <div className="dashboard-table-wrap">
        <table className="data-table dashboard-table">
          <thead><tr><th>Player</th><th>Destination</th><th>Type</th><th>Prior program</th><th className="numeric">GP</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">TS%</th></tr></thead>
          <tbody>
            {ranked.map((person) => (
              <tr key={person.key}>
                <th scope="row">{person.name}</th>
                <td>{programs.get(person.team_id) || "—"}</td>
                <td>{person.category}</td>
                <td>{person.previous_program || "—"}</td>
                <td className="numeric">{person.stats?.games ?? "—"}</td>
                <td className="numeric"><strong>{fmt(person.stats?.ppg)}</strong></td>
                <td className="numeric">{fmt(person.stats?.rpg)}</td>
                <td className="numeric">{fmt(person.stats?.apg)}</td>
                <td className="numeric">{person.stats?.ts == null ? "—" : `${fmt(person.stats.ts * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ImpactTable({ players }: { players: ImpactPlayer[] }) {
  const rows = players
    .filter((player) => player.qualified && player.rapm_net != null)
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 10);
  return (
    <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table">
        <thead><tr><th>#</th><th>Player</th><th>Team</th><th className="numeric">ORAPM</th><th className="numeric">DRAPM</th><th className="numeric">NET</th><th className="numeric">Possessions</th></tr></thead>
        <tbody>{rows.map((player) => (
          <tr key={`${player.player_id}-${player.team}`}>
            <td className="rank-number">{player.rank ?? "—"}</td>
            <th scope="row"><Link href={`/basketball/ncaa-player/?id=${encodeURIComponent(player.player_id)}&season=2026`}>{player.player}</Link></th>
            <td>{player.team}</td>
            <td className="numeric">{fmt(player.orapm, 2)}</td>
            <td className="numeric">{fmt(player.drapm, 2)}</td>
            <td className="numeric"><strong>{fmt(player.rapm_net, 2)}</strong></td>
            <td className="numeric">{fmt(player.off_poss, 0)} / {fmt(player.def_poss, 0)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function ValueTable({ players, season }: { players: ValueLeader[]; season: number }) {
  return (
    <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table">
        <thead><tr><th>#</th><th>Player</th><th>Team</th><th className="numeric">MIN</th><th className="numeric">BOX BPM</th></tr></thead>
        <tbody>{players.slice(0, 10).map((player) => (
          <tr key={`${player.id}-${player.team_id}`}>
            <td className="rank-number">{player.rank ?? "—"}</td>
            <th scope="row"><Link href={`/basketball/player/?id=${encodeURIComponent(player.id)}&season=${season}`}>{player.name}</Link></th>
            <td>{player.team}</td>
            <td className="numeric">{fmt(player.minutes, 0)}</td>
            <td className="numeric"><strong>{fmt(player.value, 2)}</strong></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function DataCoverageTable({ overview }: { overview: ReturnType<typeof getBasketball> }) {
  const displayLabel = (dataset: { key: string; label: string }) => {
    const labels: Record<string, string> = {
      ncaa_player_box: "Archived player game boxes",
      ncaa_player_season: "Archived player-season aggregates",
      ncaa_lineups: "Lineup stints",
      ncaa_rapm: "Lineup impact estimates",
      ncaa_team_rosters: "Roster and school context",
      ncaa_shots: "Attributed shooting profiles",
      ncaa_possessions: "Possession-style profiles",
      ncaa_game_rosters: "Game-day rosters",
      ncaa_officials: "Game officiating assignments",
      player_season: "Season player stats",
      publisher_ratings: "Archived team ratings",
    };
    return labels[dataset.key] || dataset.label.replace(/\b(?:NCAA|ESPN)\b/gi, "Archived");
  };
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
            <tr key={dataset.key === "publisher_ratings" ? "archived_ratings" : dataset.key}>
              <th scope="row">{displayLabel(dataset)}<small>{dataset.key === "player_box" ? "Game-level player production" : dataset.key === "ncaa_player_box" ? "Archived player game production" : dataset.key === "player_season" ? "Season player aggregates" : dataset.key === "ncaa_player_season" ? "Archived player aggregates" : dataset.key === "rosters" ? "Current roster records" : dataset.key === "schedule" ? "Game schedule and finals" : dataset.key === "team_box" ? "Game-level team production" : dataset.key === "publisher_ratings" ? "Archived team ratings" : "Retained dataset"}</small></th>
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
  const rosterModel = getRosterModel();
  const rosterLeaders = getRosterLeaders();
  const players = getPlayers(overview.season);
  const recruiting = getRecruiting();
  const impact = getImpact(overview.season);
  const forecasts = overview.upcoming.filter((game) => predictionFor(game));
  const forecastRows = overview.coverage.forecast_games + (overview.coverage.baseline_estimate_games || 0);
  const latestSeason = overview.season - 1;
  const valueLeaders = getValueLeaders(latestSeason);
  const nationalPlayers = getNationalPlayers(latestSeason) as NationalPlayerRow[];
  const metrics: BasketballLeaderMetric[] = ["ppg", "rpg", "apg", "spg", "bpg", "ts"];
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
          <strong>{forecastRows.toLocaleString()}</strong>
          <span>upcoming matchup forecasts</span>
          <small>Model edition · {overview.model.version}</small>
          {overview.coverage.forecast_games ? <small>{overview.coverage.forecast_games.toLocaleString()} primary{overview.coverage.baseline_estimate_games ? ` + ${overview.coverage.baseline_estimate_games.toLocaleString()} cold-start` : ""} rows are labeled in the table.</small> : null}
          <small>Roster lens · {rosterModel.coverage.scenario_games.toLocaleString()} game scenarios · {rosterModel.evaluation.improvement_vs_prior_net == null ? "evaluation pending" : `${fmt(rosterModel.evaluation.improvement_vs_prior_net, 1)} pts better than prior net in holdout`}</small>
          <div className="dashboard-model-rule" />
          <div><b>{fmt(overview.model.evaluation.winner_accuracy * 100)}%</b><span>held-out winner accuracy</span></div>
          <div><b>{fmt(overview.model.evaluation.margin_mae)} pts</b><span>held-out margin error</span></div>
          <div><b>{overview.coverage.upcoming_games ? fmt((forecastRows / overview.coverage.upcoming_games) * 100) : "—"}%</b><span>upcoming slate covered</span></div>
          {overview.model.evaluation.baseline_margin_mae != null && (
            <small>
              {fmt(Math.max(0, overview.model.evaluation.baseline_margin_mae - overview.model.evaluation.margin_mae))} pts lower margin error than the baseline on holdout games.
            </small>
          )}
        </div>
      </section>
      <div className="dashboard-strip">
        <div><strong>{overview.ratings.length}</strong><span>Rated teams</span></div>
        <div><strong>{players.length.toLocaleString()}</strong><span>Player profiles</span></div>
        <div><strong>{overview.coverage.upcoming_games.toLocaleString()}</strong><span>Upcoming games</span></div>
        <div><strong>{overview.coverage.player_box_rows.toLocaleString()}</strong><span>Player box records</span></div>
      </div>
      <LiveBasketballForecastStatus />
      <LiveBasketballMarketStatus />
      <section className="dashboard-section" aria-labelledby="dashboard-games">
        <div className="dashboard-section-heading"><div><span className="eyebrow">01 / GAME CENTER</span><h2 id="dashboard-games">Upcoming games &amp; predictions</h2></div><Link href="/basketball/matchups/">View all {forecasts.length.toLocaleString()} forecasts →</Link></div>
        <p className="dashboard-caption">Every row below has a Silvermine score projection, win probability, margin, calibrated range and total. The roster lens adds a second Silvermine model built from recorded continuity and prior workload; it does not overwrite the primary probability or range.</p>
        <LiveDashboardForecastTable initialGames={forecasts} rosterScenarios={rosterModel.scenarios} />
      </section>
      <div className="dashboard-two-col">
        <section className="dashboard-section" aria-labelledby="dashboard-teams">
          <div className="dashboard-section-heading"><div><span className="eyebrow">02 / TEAM STATS</span><h2 id="dashboard-teams">Power ratings</h2></div><Link href="/basketball/ratings/">Full team table →</Link></div>
          <p className="dashboard-caption">Latest completed-season team stats: adjusted offense, defense, net rating, pace, schedule strength and the four factors.</p>
          <TeamTable teams={overview.ratings} />
          <LiveTeamProductionTable teamIds={overview.ratings.map((team) => team.id)} />
        </section>
        <section className="dashboard-section" aria-labelledby="dashboard-players">
          <div className="dashboard-section-heading"><div><span className="eyebrow">03 / PLAYER STATS</span><h2 id="dashboard-players">All-around player index</h2></div><Link href="/basketball/players/">Full player table →</Link></div>
          <p className="dashboard-caption">Top qualified {latestSeason - 1}–{String(latestSeason).slice(-2)} players by an eight-field percentile index: scoring, rebounding, playmaking, defensive events, true shooting, effective shooting and turnover control.</p>
          <PlayerTable players={players} season={latestSeason} />
        </section>
      </div>
      <section className="dashboard-section" aria-labelledby="dashboard-leaders">
        <div className="dashboard-section-heading"><div><span className="eyebrow">04 / NATIONAL LEADERS</span><h2 id="dashboard-leaders">More player production</h2></div><Link href="/basketball/leaders/">Full leaders table →</Link></div>
        <p className="dashboard-caption">The same qualified player file, grouped by six quick ways to find a standout: scoring, rebounding, playmaking, steals, rim protection and true shooting.</p>
        <LeaderCards players={players} season={latestSeason} />
      </section>
      {nationalPlayers.length ? (
        <section className="dashboard-section" aria-labelledby="dashboard-national-records">
          <div className="dashboard-section-heading"><div><span className="eyebrow">05 / NATIONAL RECORDS</span><h2 id="dashboard-national-records">Division I scoring leaders</h2></div><Link href="/basketball/ncaa/?division=1&amp;stat=ppg">Full national table →</Link></div>
          <p className="dashboard-caption">Final Division I records with the supplied national rank, shooting splits and games played. This archive remains separate from the production and impact model layers.</p>
          <LiveNationalPlayerTable initialPlayers={nationalPlayers} season={latestSeason} />
        </section>
      ) : null}
      <section className="dashboard-section" aria-labelledby="dashboard-impact">
        <div className="dashboard-section-heading"><div><span className="eyebrow">06 / PLAYER IMPACT</span><h2 id="dashboard-impact">Who moves the margin?</h2></div><Link href="/basketball/impact/">Full impact table →</Link></div>
        <p className="dashboard-caption">Qualified regularized adjusted plus-minus from the latest completed season, with offensive and defensive components and the possession sample behind each row.</p>
        <ImpactTable players={impact} />
      </section>
      {valueLeaders.length ? (
        <section className="dashboard-section" aria-labelledby="dashboard-value">
          <div className="dashboard-section-heading"><div><span className="eyebrow">07 / BOX VALUE</span><h2 id="dashboard-value">Box-score value leaders</h2></div><Link href="/basketball/boutique/?kind=players&amp;metric=box_bpm&amp;season=2026">Full value table →</Link></div>
          <p className="dashboard-caption">A separate box-score value estimate gives a second view of player contribution. Keep it beside RAPM; the two models answer different questions.</p>
          <ValueTable players={valueLeaders} season={latestSeason} />
        </section>
      ) : null}
      <section className="dashboard-section" aria-labelledby="dashboard-roster-production">
        <div className="dashboard-section-heading"><div><span className="eyebrow">08 / ROSTER PRODUCTION</span><h2 id="dashboard-roster-production">2026–27 roster workload leaders</h2></div><Link href="/basketball/roster-board/">Full roster board →</Link></div>
        <p className="dashboard-caption">Players listed for the next season, ordered by a transparent prior-production index across scoring, rebounding, playmaking, defensive events and shooting. The row keeps prior workload beside the player so recruiting context stays measurable.</p>
        <RosterProductionTable rows={rosterLeaders} />
      </section>
      <section className="dashboard-section" aria-labelledby="dashboard-coverage">
          <div className="dashboard-section-heading"><div><span className="eyebrow">10 / DATA COVERAGE</span><h2 id="dashboard-coverage">What is in the warehouse</h2></div><Link href="/research/coverage/">Open coverage checks →</Link></div>
        <p className="dashboard-caption">Player boxes, archives, rosters, schedules and ratings retained for analysis. “Latest data” is the newest captured row for each dataset.</p>
        <DataCoverageTable overview={overview} />
      </section>
      {recruiting ? (
        <section className="dashboard-section" aria-labelledby="dashboard-recruiting">
          <div className="dashboard-section-heading"><div><span className="eyebrow">11 / RECRUITING INTEL</span><h2 id="dashboard-recruiting">Prior production on the move</h2></div><Link href="/basketball/recruiting/">Full recruiting board →</Link></div>
          <p className="dashboard-caption">A ranked view of retained 2026–27 additions with their recorded destination and prior college production. These are recruiting observations, not eligibility or availability decisions.</p>
          <RecruitingSnapshot release={recruiting} />
        </section>
      ) : null}
      <LiveBasketballProspectLeaders />
      <section className="dashboard-section dashboard-links" aria-labelledby="dashboard-drilldowns">
        <div className="dashboard-section-heading"><div><span className="eyebrow">12 / EXPLORE THE BOARD</span><h2 id="dashboard-drilldowns">More numbers, clearer paths.</h2></div></div>
        <div className="dashboard-link-grid">
          <Link href="/basketball/ncaa-player-box/"><strong>Game logs</strong><span>Every retained player box score and split</span><b>→</b></Link>
          <Link href="/basketball/source-stats/"><strong>Player stat browser</strong><span>Search the complete season line, totals and rate fields</span><b>→</b></Link>
          <Link href="/basketball/blog/"><strong>Game notebooks</strong><span>Read the model, factors and next checks for every forecast</span><b>→</b></Link>
          <Link href="/basketball/ncaa-shooting/"><strong>Shooting lab</strong><span>Shot profile, zones and field-goal attempts</span><b>→</b></Link>
          <Link href="/basketball/lineups/"><strong>Lineups</strong><span>Five-player stints and net performance</span><b>→</b></Link>
          <Link href="/basketball/recruiting/"><strong>Recruiting</strong><span>Rankings, roster movement and fit</span><b>→</b></Link>
          <Link href="/basketball/learn/#team-metrics"><strong>Team metrics</strong><span>Learn pace, SOS, four factors and adjusted ratings</span><b>→</b></Link>
          <Link href="/basketball/learn/#forecasting"><strong>Forecasts</strong><span>See how the Silvermine game model turns team data into a projection</span><b>→</b></Link>
          <Link href="/basketball/learn/#recruiting"><strong>Recruiting evidence</strong><span>Read rankings, production and roster observations with their boundaries</span><b>→</b></Link>
        </div>
      </section>
      <p className="dashboard-updated">Board updated {date(overview.generated_at)} · {leaderCounts.reduce((sum, item) => sum + item.count, 0).toLocaleString()} qualified metric records available in the player file.</p>
    </div>
  );
}
