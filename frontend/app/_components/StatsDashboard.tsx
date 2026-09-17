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
import LiveBasketballPlayerArchiveStatus from "./LiveBasketballPlayerArchiveStatus";
import LiveBasketballRecruitingStatus from "./LiveBasketballRecruitingStatus";
import LiveBasketballScheduleStatus from "./LiveBasketballScheduleStatus";
import LiveBasketballProspectLeaders from "./LiveBasketballProspectLeaders";
import LiveBasketballMovementLeaders from "./LiveBasketballMovementLeaders";
import type { NationalPlayerRow } from "./LiveNationalPlayerTable";
import LiveNationalPlayerTable from "./LiveNationalPlayerTable";
import LiveTeamProductionTable from "./LiveTeamProductionTable";
import LiveDashboardForecastTable from "./LiveDashboardForecastTable";
import LiveNcaaPlayerTable from "./LiveNcaaPlayerTable";

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

function AdjustedFourFactorsTable({ teams }: { teams: BBTeam[] }) {
  const pct = (value: number | null | undefined) => value == null ? "—" : `${fmt(value * 100, 1)}%`;
  const rows = teams.filter((team) => team.adj_off_efg != null || team.adj_def_efg != null).slice(0, 12);
  return (
    <section className="dashboard-subsection" aria-labelledby="dashboard-four-factors">
      <div className="dashboard-section-heading">
        <div><span className="eyebrow">ADJUSTED FOUR FACTORS</span><h3 id="dashboard-four-factors">Where teams win possessions</h3></div>
        <Link href="/basketball/learn/#four-factors">Read the factor guide →</Link>
      </div>
      <p className="dashboard-caption">Opponent-adjusted offense and defense rates from the latest completed season. Lower turnover and free-throw rates are better on defense; higher shooting and offensive rebounding rates are better on offense.</p>
      <div className="dashboard-table-wrap">
        <table className="data-table dashboard-table">
          <thead>
            <tr><th>Team</th><th className="numeric">O eFG%</th><th className="numeric">D eFG%</th><th className="numeric">O TO%</th><th className="numeric">D TO%</th><th className="numeric">O ORB%</th><th className="numeric">D ORB%</th><th className="numeric">O FTR</th><th className="numeric">D FTR</th></tr>
          </thead>
          <tbody>{rows.map((team) => (
            <tr key={team.id}>
              <th scope="row"><Link href={`/basketball/programs/${encodeURIComponent(team.id)}/`}>{team.name}</Link><small>#{team.rank} net rating</small></th>
              <td className="numeric"><strong>{pct(team.adj_off_efg)}</strong></td>
              <td className="numeric">{pct(team.adj_def_efg)}</td>
              <td className="numeric">{pct(team.adj_off_tov)}</td>
              <td className="numeric">{pct(team.adj_def_tov)}</td>
              <td className="numeric">{pct(team.adj_off_orb)}</td>
              <td className="numeric">{pct(team.adj_def_orb)}</td>
              <td className="numeric">{pct(team.adj_off_ftr)}</td>
              <td className="numeric">{pct(team.adj_def_ftr)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
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
      player_crosswalk: "Player identity crosswalk",
      player_core: "Archived player profiles",
      team_season: "Team-season aggregates",
      publisher_player_value: "Archived player value",
      player_season: "Season player stats",
      publisher_ratings: "Archived team ratings",
    };
    return labels[dataset.key] || dataset.label.replace(/\b(?:NCAA|ESPN)\b/gi, "Archived");
  };
  const rows = (overview.coverage.datasets || [])
    .filter((dataset) => dataset.rows > 0)
    .sort((a, b) => b.rows - a.rows || a.label.localeCompare(b.label));
  const links: Record<string, string> = {
    schedule: "/basketball/games/",
    team_box: "/basketball/ncaa-team-box/",
    player_box: "/basketball/ncaa-player-box/",
    player_crosswalk: "/basketball/crosswalk/",
    rosters: "/basketball/roster-board/",
    player_season: "/basketball/players/",
    team_season: "/basketball/team-stats/",
    publisher_ratings: "/basketball/boutique/?kind=ratings",
    publisher_player_value: "/basketball/boutique/?kind=players",
    ncaa_lineups: "/basketball/lineups/",
    player_core: "/basketball/player-profiles/",
    ncaa_rapm: "/basketball/impact/",
    ncaa_player_box: "/basketball/ncaa-player-box/",
    ncaa_player_season: "/basketball/ncaa-careers/",
    ncaa_team_rosters: "/basketball/ncaa-rosters/",
    ncaa_shots: "/basketball/ncaa-shooting/",
    ncaa_possessions: "/basketball/possession-style/",
    ncaa_game_rosters: "/basketball/ncaa-rosters/",
    ncaa_officials: "/basketball/games/",
  };
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
              <th scope="row"><Link href={links[dataset.key] || "/research/coverage/"}>{displayLabel(dataset)} →</Link><small>{dataset.key === "player_box" ? "Game-level player production" : dataset.key === "ncaa_player_box" ? "Archived player game production" : dataset.key === "player_season" ? "Season player aggregates" : dataset.key === "ncaa_player_season" ? "Archived player aggregates" : dataset.key === "rosters" ? "Current roster records" : dataset.key === "schedule" ? "Game schedule and finals" : dataset.key === "team_box" ? "Game-level team production" : dataset.key === "publisher_ratings" ? "Archived team ratings" : dataset.key === "ncaa_lineups" ? "Five-player lineup stints" : dataset.key === "ncaa_rapm" ? "Regularized lineup impact" : dataset.key === "ncaa_shots" ? "Attributed shot profiles" : dataset.key === "ncaa_possessions" ? "Team possession-style rows" : dataset.key === "ncaa_game_rosters" ? "Game-day player listings" : dataset.key === "ncaa_officials" ? "Game officiating rows" : dataset.key === "player_core" ? "Player identity and profile rows" : dataset.key === "player_crosswalk" ? "Cross-source identity links" : dataset.key === "publisher_player_value" ? "Archived player value rows" : dataset.key === "team_season" ? "Team-season aggregates" : "Retained dataset"}</small></th>
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
  const nationalPlayers = getNationalPlayers(overview.season - 1);
  const recruiting = getRecruiting();
  const latestSeason = overview.season - 1;
  const impactPlayers = getImpact(latestSeason);
  const valueLeaders = getValueLeaders(latestSeason);
  const forecasts = overview.upcoming.filter((game) => predictionFor(game));
  const forecastRows = overview.coverage.forecast_games + (overview.coverage.baseline_estimate_games || 0);
  return (
    <div className="stats-dashboard">
      <div className="dashboard-kicker"><span>MEN&apos;S COLLEGE BASKETBALL</span><span>{overview.label} / LIVE BOARD</span></div>
      <section className="dashboard-hero">
        <div>
          <div className="eyebrow">2026–27 data center</div>
          <h1>Games. Teams.<br /><em>Players.</em></h1>
          <p>Upcoming matchups, adjusted team strength, player production and Silvermine forecasts in one live board.</p>
          <div className="hero-actions"><Link className="button" href="/basketball/matchups/">View the slate ↗</Link><Link className="hero-link" href="/basketball/ncaa-rankings/">Player rankings →</Link><Link className="hero-link" href="/basketball/ratings/">Team ratings →</Link></div>
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
          <div><b>{fmt(overview.model.evaluation.brier, 3)}</b><span>held-out probability Brier</span></div>
          <div><b>{fmt(overview.model.evaluation.interval_coverage * 100)}%</b><span>margin band coverage</span></div>
          {overview.model.evaluation.baseline_margin_mae != null && (
            <small>
              {fmt(Math.max(0, overview.model.evaluation.baseline_margin_mae - overview.model.evaluation.margin_mae))} pts lower margin error than the baseline on holdout games.
            </small>
          )}
          <small>Fit on {overview.model.training_games.toLocaleString()} completed games across {overview.model.training_seasons.length} seasons · holdout {overview.model.evaluation.season - 1}–{String(overview.model.evaluation.season).slice(-2)} · calibrated {date(overview.model.cutoff)}.</small>
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
      <LiveBasketballScheduleStatus />
      <LiveBasketballPlayerArchiveStatus />
      <LiveBasketballRecruitingStatus />
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
          <AdjustedFourFactorsTable teams={overview.ratings} />
          <LiveTeamProductionTable teamIds={overview.ratings.map((team) => team.id)} />
        </section>
        <section className="dashboard-section" aria-labelledby="dashboard-players">
          <div className="dashboard-section-heading"><div><span className="eyebrow">03 / PLAYER STATS</span><h2 id="dashboard-players">All-around player index</h2></div><Link href="/basketball/players/">Full player table →</Link></div>
          <p className="dashboard-caption">Top qualified {latestSeason - 1}–{String(latestSeason).slice(-2)} players by an eight-field percentile index: scoring, rebounding, playmaking, defensive events, true shooting, effective shooting and turnover control.</p>
          <PlayerTable players={players} season={latestSeason} />
          <LiveNcaaPlayerTable season={latestSeason} />
          <LiveNationalPlayerTable initialPlayers={nationalPlayers} season={latestSeason} />
          <div className="dashboard-subsection" aria-labelledby="dashboard-single-stat-leaders">
            <div className="dashboard-section-heading"><div><span className="eyebrow">SINGLE-STAT LEADERS</span><h3 id="dashboard-single-stat-leaders">Who leads each box-score field?</h3></div><Link href="/basketball/leaders/">Open every leaderboard →</Link></div>
            <p className="dashboard-caption">Top five qualified players for each commonly used production field. Select a field on the full leaderboard when you need the complete cohort or a different denominator.</p>
            <LeaderCards players={players} season={latestSeason} />
          </div>
        </section>
      </div>
      {recruiting ? (
        <section className="dashboard-section" aria-labelledby="dashboard-recruiting">
          <div className="dashboard-section-heading">
            <div><span className="eyebrow">04 / RECRUITING BOARD</span><h2 id="dashboard-recruiting">Roster movement with prior production</h2></div>
            <Link href="/basketball/recruiting/">Open the recruiting desk →</Link>
          </div>
          <p className="dashboard-caption">A compact view of the retained 2027 recruiting edition. Prior production is shown only when the player identity and previous program resolve to a recorded season line.</p>
          <RecruitingSnapshot release={recruiting} />
        </section>
      ) : null}
      <section className="dashboard-section" aria-labelledby="dashboard-impact">
        <div className="dashboard-section-heading">
          <div><span className="eyebrow">05 / PLAYER IMPACT</span><h2 id="dashboard-impact">Impact and value leaders</h2></div>
          <Link href="/basketball/impact/">Full impact table →</Link>
        </div>
        <p className="dashboard-caption">Two complementary player measures from the latest completed season: lineup-based impact with possession samples, beside the retained box-score value estimate. They are descriptive research measures, not forecast inputs.</p>
        <div className="dashboard-two-col">
          <section className="dashboard-subsection" aria-labelledby="dashboard-rapm">
            <div className="dashboard-section-heading"><div><span className="eyebrow">LINEUP IMPACT</span><h3 id="dashboard-rapm">Net RAPM leaders</h3></div></div>
            <ImpactTable players={impactPlayers} />
          </section>
          <section className="dashboard-subsection" aria-labelledby="dashboard-bpm">
            <div className="dashboard-section-heading"><div><span className="eyebrow">BOX VALUE</span><h3 id="dashboard-bpm">Box BPM leaders</h3></div><Link href="/basketball/boutique/?kind=players">Value archive →</Link></div>
            <ValueTable players={valueLeaders} season={latestSeason} />
          </section>
        </div>
      </section>
      <section className="dashboard-section" aria-labelledby="dashboard-secondary">
        <div className="dashboard-section-heading"><div><span className="eyebrow">06 / DRILL DOWN</span><h2 id="dashboard-secondary">More ways to read the numbers</h2></div></div>
        <p className="dashboard-caption">The landing board stays focused on games, teams and players. Open a dedicated desk when you need impact, recruiting movement, source rows or model details.</p>
        <div className="dashboard-link-grid">
          <Link href="/basketball/leaders/"><strong>Player leaders</strong><span>Scoring, rebounding, playmaking, defense and shooting</span><b>→</b></Link>
          <Link href="/basketball/impact/"><strong>Player impact</strong><span>RAPM components, possession samples and lineup context</span><b>→</b></Link>
          <Link href="/basketball/recruiting/"><strong>Recruiting board</strong><span>Prospects, transfers, roster changes and fit</span><b>→</b></Link>
          <Link href="/basketball/roster-board/"><strong>Roster production</strong><span>Prior workload and 2026–27 continuity signals</span><b>→</b></Link>
          <Link href="/research/coverage/"><strong>Data coverage</strong><span>Rows, seasons, capture clocks and integrity checks</span><b>→</b></Link>
          <Link href="/basketball/ncaa-shooting/"><strong>Shooting lab</strong><span>Zones, attempts, rates and player shot profiles</span><b>→</b></Link>
          <Link href="/basketball/lineups/"><strong>Lineups</strong><span>Five-player stints and net performance</span><b>→</b></Link>
          <Link href="/basketball/model/"><strong>Model notebook</strong><span>Training windows, calibration and held-out error</span><b>→</b></Link>
        </div>
      </section>
      <LiveBasketballMovementLeaders />
      <LiveBasketballProspectLeaders />
      <p className="dashboard-updated">Board updated {date(overview.generated_at)} · {players.length.toLocaleString()} player rows available in the current release.</p>
    </div>
  );
}
