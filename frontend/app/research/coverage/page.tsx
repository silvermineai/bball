import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { getBasketball, getRecruiting, getRosters } from "../../_lib/basketball-data";
import { getOverview } from "../../_lib/data";
import { getLedger } from "../../_lib/research-data";
import { date, fmt } from "../../_lib/format";
import CoverageLive from "./CoverageLive";

export const metadata = {
  title: "Coverage, sources and limitations",
  description:
    "A dated inventory of Silvermine football, basketball, player, recruiting and forecast coverage.",
};

const count = (value: number) => value.toLocaleString("en-US");
const neutralText = (value: string) => value
  .replace(/SportsDataverse/gi, "retained archive")
  .replace(/ESPN(?:-derived)?/gi, "retained")
  .replace(/NCAA(?:-derived)?/gi, "college")
  .replace(/source[- ]release/gi, "retained edition")
  .replace(/publisher/gi, "feed");

export default function Page() {
  const football = getOverview();
  const basketball = getBasketball();
  const lowerFootballResults = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public/data/football/lower-division-results-2026.json"), "utf8"),
  ) as {
    coverage: Record<"d2" | "d3", { games: number; score_complete: number; scores_missing: number }>;
    source?: { fetched_at?: string | null; sha256?: string | null };
  };
  const footballPlayerCatalog = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public/data/football/player-catalog.json"), "utf8"),
  ) as {
    seasons: {
      season: number;
      file?: string;
      box_rows: number;
      box_games: number;
      player_team_records: number;
    }[];
  };
  const latestFootballPlayers = JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        "public/data/football",
        footballPlayerCatalog.seasons.at(-1)?.file ?? "players-2026.json",
      ),
      "utf8",
    ),
  ) as { players?: Array<{ division?: string | null }> };
  const footballScopeRows = (latestFootballPlayers.players ?? []).reduce(
    (counts, player) => {
      const division = String(player.division ?? "").toLowerCase();
      if (division === "fbs" || division === "fcs") counts.d1 += 1;
      else if (division === "d2" || division === "2") counts.d2 += 1;
      else if (division === "d3" || division === "3") counts.d3 += 1;
      return counts;
    },
    { d1: 0, d2: 0, d3: 0 },
  );
  const footballArchiveRows = footballPlayerCatalog.seasons.reduce(
    (sum, season) => sum + season.box_rows,
    0,
  );
  const footballPlayerRecords = footballPlayerCatalog.seasons.reduce(
    (sum, season) => sum + season.player_team_records,
    0,
  );
  const footballNcaaReceipts = football.sources.filter(
    (source) => source.dataset === "ncaa_player_stats",
  );
  const footballNcaaLatest = [...footballNcaaReceipts].sort((a, b) =>
    b.fetched_at.localeCompare(a.fetched_at),
  )[0];
  const footballNcaaSeasons = footballNcaaReceipts
    .map((source) => source.season)
    .sort((a, b) => a - b);
  const footballEvents = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public/data/football/events.json"), "utf8"),
  ) as {
    generated_at: string;
    editions: {
      season: number;
      dataset: "defense" | "specialists";
      coverage: {
        records: number;
        games: number;
        matched_context: number;
        name_only_records: number;
      };
    }[];
  };
  const footballEventRows = footballEvents.editions.reduce(
    (sum, edition) => sum + edition.coverage.records,
    0,
  );
  const footballEventGames = footballEvents.editions.reduce(
    (sum, edition) => sum + edition.coverage.games,
    0,
  );
  const footballEventSeasons = Array.from(
    new Set(footballEvents.editions.map((edition) => edition.season)),
  ).sort((a, b) => a - b);
  const rosters = getRosters();
  const rosterSnapshots = [2025, 2026, 2027].map((season) => {
    const filename = season === 2027 ? "rosters.json" : `rosters-${season}.json`;
    const snapshot = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public/data/basketball", filename), "utf8"),
    ) as {
      season: number;
      teams_observed: number;
      players_observed: number;
    };
    return snapshot;
  });
  const rosterSourceProfiles = rosters.players.filter((player) => player.source_url).length;
  const rosterBpmRows = rosters.players.filter(
    (player) => player.prior_production?.box_bpm != null,
  ).length;
  const rosterBpmShare = rosters.players_observed
    ? (rosterBpmRows / rosters.players_observed) * 100
    : null;
  const recruiting = getRecruiting();
  const ledger = getLedger();
  const dataDir = path.join(process.cwd(), "public/data/basketball");
  const history = JSON.parse(
    fs.readFileSync(path.join(dataDir, "history/index.json"), "utf8"),
  ) as {
    player_ids: number;
    generated_at: string;
    seasons: { season: number; source_rows: number; identified_rows: number }[];
    sources: { url: string }[][];
  };
  const pbp = JSON.parse(
    fs.readFileSync(path.join(dataDir, "pbp-catalog.json"), "utf8"),
  ) as {
    seasons: {
      season: number;
      generated_at: string;
      source: { url: string };
      coverage: { source_events: number };
    }[];
  };
  const matchupStints = JSON.parse(
    fs.readFileSync(path.join(dataDir, "matchup-stints.json"), "utf8"),
  ) as {
    seasons: {
      season: number;
      generated_at: string;
      source: { url: string };
      coverage: { source_rows: number };
    }[];
  };
  const ncaaTeamBox = JSON.parse(
    fs.readFileSync(path.join(dataDir, "ncaa-team-box.json"), "utf8"),
  ) as {
    seasons: {
      season: number;
      generated_at: string;
      coverage: { source_rows: number };
    }[];
  };
  const withinImpact = JSON.parse(
    fs.readFileSync(path.join(dataDir, "impact-within-team.json"), "utf8"),
  ) as {
    seasons: {
      season: number;
      generated_at: string;
      coverage: { source_rows: number };
    }[];
  };
  const ncaa = JSON.parse(
    fs.readFileSync(path.join(dataDir, "ncaa-individual.json"), "utf8"),
  ) as { coverage: { players: number; divisions: Record<string, unknown> } };
  const womensEdition = JSON.parse(
    fs.readFileSync(path.join(dataDir, "womens-edition.json"), "utf8"),
  ) as { coverage: { players: number; teams: number; upcoming_games: number } };
  const womensForecast = JSON.parse(
    fs.readFileSync(path.join(dataDir, "womens-forecast.json"), "utf8"),
  ) as { coverage: { forecast_rows: number; primary_rows: number; cold_start_rows: number }; model_id: string };
  const basketballScopeRows = {
    d1: Number((ncaa.coverage.divisions["1"] as { players?: number } | undefined)?.players ?? 0),
    d2: Number((ncaa.coverage.divisions["2"] as { players?: number } | undefined)?.players ?? 0),
    d3: Number((ncaa.coverage.divisions["3"] as { players?: number } | undefined)?.players ?? 0),
  };
  const impact = JSON.parse(
    fs.readFileSync(path.join(dataDir, "impact.json"), "utf8"),
  ) as { players: unknown[] };
  const shooting = JSON.parse(
    fs.readFileSync(path.join(dataDir, "shooting.json"), "utf8"),
  ) as {
    coverage: {
      field_goal_attempts: number;
      pbp_events?: number;
      pbp_games?: number;
      player_games?: number;
      matched_player_games?: number;
      locations?: Record<string, number>;
    };
  };
  const possessionStyle = JSON.parse(
    fs.readFileSync(path.join(dataDir, "ncaa-possession-style.json"), "utf8"),
  ) as {
    generated_at: string;
    seasons: {
      season: number;
      generated_at: string;
      source: { url?: string };
      coverage: { source_rows: number; teams: number; invalid_points?: number; invalid_flag_rows?: number };
    }[];
  };
  const shotLocations = shooting.coverage.locations ?? {};
  const invalidPossessionPoints = possessionStyle.seasons.reduce(
    (sum, season) => sum + (season.coverage.invalid_points ?? 0),
    0,
  );
  const invalidPossessionFlags = possessionStyle.seasons.reduce(
    (sum, season) => sum + (season.coverage.invalid_flag_rows ?? 0),
    0,
  );
  const locatedShots = shotLocations.located ?? 0;
  const rejectedLocationShots = (shotLocations.inconsistent ?? 0) + (shotLocations.placeholder ?? 0) + (shotLocations.missing ?? 0);
  const locationTotal = locatedShots + rejectedLocationShots;
  const locationShare = locationTotal ? (locatedShots / locationTotal) * 100 : null;
  const publisher = JSON.parse(
    fs.readFileSync(path.join(dataDir, "publisher-leaders.json"), "utf8"),
  ) as { metrics: unknown[] };
  const ncaaPlayerBox = JSON.parse(
    fs.readFileSync(path.join(dataDir, "ncaa-player-box-catalog.json"), "utf8"),
  ) as {
    generated_at: string;
    total_rows: number;
    seasons: { season: number; rows: number; source_url?: string }[];
  };
  const playerBoxFields = JSON.parse(
    fs.readFileSync(path.join(dataDir, "ncaa-player-box-fields.json"), "utf8"),
  ) as {
    generated_at: string;
    fields: string[];
    seasons: {
      season: number;
      rows: number;
      fields: Record<string, { observed: number; share: number }>;
    }[];
  };
  const latestPlayerBoxFields = playerBoxFields.seasons.at(-1);
  const fieldGroup = (field: string) => {
    if (/^(rim|mid|tp|fg|ft|efg|ts)_/.test(field) || /^(rima|rimm|mida|midm|tpa|tpm|fga|fgm|fta|ftm)/.test(field)) return "Shot zones";
    if (/(trans|half|unast|ast)$/.test(field) || /_(trans|half|unast|ast)_/.test(field)) return "Context splits";
    if (field.includes("pct") || field.endsWith("_rate")) return "Efficiency rates";
    if (["ast", "blk", "drb", "mins", "o_poss", "orb", "pf", "pts", "stl", "tov"].includes(field)) return "Core box totals";
    return "Core box totals";
  };
  const fieldGroups = ["Core box totals", "Shot zones", "Context splits", "Efficiency rates"];
  const playerBoxFieldRows = fieldGroups.flatMap((group) =>
    playerBoxFields.fields
      .filter((field) => fieldGroup(field) === group)
      .sort()
      .map((field) => {
        const latest = latestPlayerBoxFields?.fields[field];
        const seasonsObserved = playerBoxFields.seasons.filter(
          (season) => (season.fields[field]?.observed ?? 0) > 0,
        ).length;
        return { field, group, latest, seasonsObserved };
      }),
  );
  const completeLatestPlayerBoxFields = playerBoxFieldRows.filter(
    (row) => row.latest?.share === 1,
  ).length;
  const standings = JSON.parse(
    fs.readFileSync(path.join(dataDir, "standings.json"), "utf8"),
  ) as {
    generated_at: string;
    teams: unknown[];
    seasons: { season: number; source_url: string | null }[];
  };
  const unresolved = JSON.parse(
    fs.readFileSync(path.join(dataDir, "unresolved-coverage.json"), "utf8"),
  ) as {
    total_rows: number;
    rows_with_observed_stats: number;
    rows: { dataset: string; reason: string; rows: number; rows_with_observed_stats: number }[];
  };
  const supplemental = [
    {
      key: "career-player-box",
      label: "Historical player game archive",
      rows: history.seasons.reduce((sum, season) => sum + season.source_rows, 0),
      seasons: history.seasons.map((season) => season.season),
      latest: history.generated_at,
      url: history.sources[0]?.[0]?.url ?? null,
      note: "Retained box rows; source IDs and incomplete fields stay explicit.",
    },
    {
      key: "roster-snapshots",
      label: "Dated roster snapshots",
      rows: rosterSnapshots.reduce((sum, snapshot) => sum + snapshot.players_observed, 0),
      seasons: rosterSnapshots.map((snapshot) => snapshot.season),
      latest: basketball.coverage.datasets?.find((dataset) => dataset.key === "rosters")?.latest_source_at || basketball.generated_at,
      url: basketball.coverage.datasets?.find((dataset) => dataset.key === "rosters")?.source_url ?? null,
      note: "Three source-listed editions (2024–25, 2025–26 and 2026–27) used for dated workload continuity; listings do not establish eligibility or departure.",
    },
    {
      key: "ncaa-player-box",
      label: "Player-game warehouse",
      rows: ncaaPlayerBox.total_rows,
      seasons: ncaaPlayerBox.seasons.map((season) => season.season),
      latest: ncaaPlayerBox.generated_at,
      url: ncaaPlayerBox.seasons.at(-1)?.source_url ?? null,
      note: "Retained college rows across every available 2010–26 season; the public D1 serves the ten recent game releases plus historical season summaries. The edition receipt identifies the latest exact Parquet edition.",
    },
    {
      key: "pbp",
      label: "Play-by-play event archive",
      rows: pbp.seasons.reduce((sum, season) => sum + season.coverage.source_events, 0),
      seasons: pbp.seasons.map((season) => season.season),
      latest: pbp.seasons.reduce((latest, season) => latest > season.generated_at ? latest : season.generated_at, ""),
      url: pbp.seasons[0]?.source.url ?? null,
      note: "Source events; shooting reconciliation is available only for the editions that publish the required fields.",
    },
    {
      key: "matchup-stints",
      label: "Five-v-five matchup stints",
      rows: matchupStints.seasons.reduce((sum, season) => sum + season.coverage.source_rows, 0),
      seasons: matchupStints.seasons.map((season) => season.season),
      latest: matchupStints.seasons.reduce((latest, season) => latest > season.generated_at ? latest : season.generated_at, ""),
      url: matchupStints.seasons[0]?.source.url ?? null,
      note: "Player matchup rows; names remain tied to their recorded identity namespace.",
    },
    {
      key: "ncaa-team-box",
      label: "Team-game archive",
      rows: ncaaTeamBox.seasons.reduce((sum, season) => sum + season.coverage.source_rows, 0),
      seasons: ncaaTeamBox.seasons.map((season) => season.season),
      latest: ncaaTeamBox.seasons.reduce((latest, season) => latest > season.generated_at ? latest : season.generated_at, ""),
      url: null,
      note: "Team rows with descriptive Four Factors and tempo.",
    },
    {
      key: "within-team-impact",
      label: "Within-team RAPM archive",
      rows: withinImpact.seasons.reduce((sum, season) => sum + season.coverage.source_rows, 0),
      seasons: withinImpact.seasons.map((season) => season.season),
      latest: withinImpact.seasons.reduce((latest, season) => latest > season.generated_at ? latest : season.generated_at, ""),
      url: null,
      note: "Impact rows; qualification and possession samples remain visible.",
    },
    {
      key: "standings",
      label: "Historical standings",
      rows: standings.teams.length,
      seasons: standings.seasons.map((season) => season.season),
      latest: standings.generated_at,
      url: standings.seasons.at(-1)?.source_url ?? null,
      note: "Team-season records compacted from retained standings; source labels and display values are retained.",
    },
    {
      key: "possession-style",
      label: "Possession-style archive",
      rows: possessionStyle.seasons.reduce((sum, season) => sum + season.coverage.teams, 0),
      seasons: possessionStyle.seasons.map((season) => season.season),
      latest: possessionStyle.generated_at,
      url: possessionStyle.seasons.at(-1)?.source.url ?? null,
      note: `Retained team-season aggregates over ${possessionStyle.seasons.reduce((sum, season) => sum + season.coverage.source_rows, 0).toLocaleString()} possession rows; ${invalidPossessionFlags.toLocaleString()} malformed flag values and ${invalidPossessionPoints.toLocaleString()} malformed point values are disclosed in the edition audit. Descriptive rates stay separate from player credit and forecast features.`,
    },
  ];
  const footballLedger = ledger.sports.football;
  const basketballLedger = ledger.sports.basketball;
  const marketBySport = ledger.games.reduce(
    (summary, game) => {
      summary[game.sport].observations += game.comparisons.length;
      if (game.comparisons.length > 0) summary[game.sport].games += 1;
      return summary;
    },
    {
      football: { observations: 0, games: 0 },
      basketball: { observations: 0, games: 0 },
    },
  );
  const unresolvedBreakdown = unresolved.rows;
  const unresolvedObserved = unresolved.rows_with_observed_stats;

  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Open notebook / Coverage desk</div>
        <h1>
          Know what is here.
          <br />
          Know what is missing.
        </h1>
        <p>
          A research resource earns trust by naming its boundaries. This page
          records the active data editions, model scope, recruiting review and
          market status behind the published site. Counts are source records or
          retained identities, not claims about every player or game.
        </p>
      </div>

      <div className="strip">
        <div>
          <strong>
            {count(
              football.coverage.forecast_games +
                basketball.coverage.forecast_games,
            )}
          </strong>
          <span>Published 2026–27 matchup forecasts</span>
        </div>
        <div>
          <strong>
            {count(
              football.coverage.box_rows + basketball.coverage.player_box_rows,
            )}
          </strong>
          <span>Current-edition player box rows</span>
        </div>
        <div>
          <strong>{count(basketball.ratings.length)}</strong>
          <span>Basketball programs with ratings</span>
        </div>
        <div>
          <strong>{count(ledger.market_observations)}</strong>
          <span>Verified pregame market observations</span>
        </div>
      </div>

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">01 / The active editions</div>
            <h2>Two sports, two honest baselines.</h2>
          </div>
          <span className="note">Generated {date(football.generated_at)}</span>
        </div>
        <div className="two-col">
          <article className="paper-panel">
            <div className="eyebrow">Football / {football.season}</div>
            <h2>Scores, players and units.</h2>
            <div className="rule-list">
              <div>
                <span>Schedule records · 2022–26</span>
                <strong>{count(football.coverage.games)}</strong>
              </div>
              <div>
                <span>Player archive rows · 2018–26</span>
                <strong>{count(footballArchiveRows)}</strong>
              </div>
              <div>
                <span>Player-game evidence · 2013–25</span>
                <strong>{count(football.coverage.ncaa_player_stats_rows)}</strong>
              </div>
              <div>
                <span>Upcoming FBS forecasts</span>
                <strong>{count(football.coverage.forecast_games)}</strong>
              </div>
              <div>
                <span>2025 holdout / margin MAE</span>
                <strong>{fmt(football.model.evaluation.margin_mae)} pts</strong>
              </div>
            </div>
            <p className="note">
              The player archive spans 2018–26 and keeps defense/specialist
              event rows separate when the source has no stable athlete ID.
              Forecasts use team identities and home field; they do not use
              injuries, depth charts or recruiting.
            </p>
            <p>
              <Link href="/football/methodology/">Open football methods →</Link>
            </p>
          </article>

          <article className="paper-panel">
            <div className="eyebrow">Basketball / {basketball.season}</div>
            <h2>Possessions, players and context.</h2>
            <div className="rule-list">
              <div>
                <span>Schedule records across seasons</span>
                <strong>{count(basketball.coverage.schedule_records)}</strong>
              </div>
              <div>
                <span>Paired completed box games</span>
                <strong>{count(basketball.coverage.paired_box_games)}</strong>
              </div>
              <div>
                <span>Upcoming 2026–27 forecasts</span>
                <strong>{count(basketball.coverage.forecast_games)}</strong>
              </div>
              <div>
                <span>2025–26 holdout / margin MAE</span>
                <strong>{fmt(basketball.model.evaluation.margin_mae)} pts</strong>
              </div>
            </div>
            <p className="note">
              Historical player logs span 24 published seasons. The independent
              ratings use opponent-adjusted efficiency, tempo and pooled Four
              Factors; lineup impact stays in its own identity namespace.
            </p>
            <p>
              <Link href="/basketball/model/">Open basketball methods →</Link>
            </p>
          </article>
        </div>
      </section>

      <section className="section" aria-labelledby="scope-matrix">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Scope matrix</div>
            <h2 id="scope-matrix">Choose a sport, then trust the boundary.</h2>
          </div>
          <span className="note">Rows are counted by the current retained edition</span>
        </div>
        <p className="note">
          The navigation keeps men&apos;s, women&apos;s and division choices explicit. A published row count means the archive has records for that scope; an unavailable state stays visible instead of falling through to another division or gender.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Sport tab</th><th>Scope</th><th className="numeric">Player rows</th><th>Published use</th><th>Open</th></tr></thead>
            <tbody>
              <tr><td><strong>Men&apos;s basketball</strong></td><td>D1</td><td className="numeric">{count(basketballScopeRows.d1)}</td><td>Forecasts, player archive, ratings, recruiting and shot evidence</td><td><Link href="/basketball/">Open desk →</Link></td></tr>
              <tr><td><strong>Men&apos;s basketball</strong></td><td>D2</td><td className="numeric">{count(basketballScopeRows.d2)}</td><td>National leaderboard records; no D2 forecast slate published</td><td><Link href="/basketball/ncaa/?division=2">Open D2 records →</Link></td></tr>
              <tr><td><strong>Men&apos;s basketball</strong></td><td>D3</td><td className="numeric">{count(basketballScopeRows.d3)}</td><td>National leaderboard records; no D3 forecast slate published</td><td><Link href="/basketball/ncaa/?division=3">Open D3 records →</Link></td></tr>
              <tr><td><strong>Women&apos;s basketball</strong></td><td>D1</td><td className="numeric">{count(womensEdition.coverage.players)}</td><td>Observed player tables, roster/schedule context and {count(womensForecast.coverage.forecast_rows)} women-only forecasts</td><td><Link href="/basketball/?gender=women&division=1">Open women&apos;s desk →</Link></td></tr>
              <tr><td><strong>Women&apos;s basketball</strong></td><td>D2</td><td className="numeric">0</td><td>Not imported; no D1 rows are substituted</td><td><Link href="/basketball/?gender=women&division=2">View boundary →</Link></td></tr>
              <tr><td><strong>Women&apos;s basketball</strong></td><td>D3</td><td className="numeric">0</td><td>Not imported; no D1 rows are substituted</td><td><Link href="/basketball/?gender=women&division=3">View boundary →</Link></td></tr>
              <tr><td><strong>Football</strong></td><td>D1 (FBS/FCS)</td><td className="numeric">{count(footballScopeRows.d1)}</td><td>Player archive, team ratings, forecasts and game evidence</td><td><Link href="/football/">Open desk →</Link></td></tr>
              <tr><td><strong>Football</strong></td><td>D2</td><td className="numeric">{count(footballScopeRows.d2)}</td><td>{count(lowerFootballResults.coverage.d2.score_complete)} completed score rows; no player tables, ratings or forecasts</td><td><Link href="/football/matchups/?division=2">Open D2 results →</Link></td></tr>
              <tr><td><strong>Football</strong></td><td>D3</td><td className="numeric">{count(footballScopeRows.d3)}</td><td>{count(lowerFootballResults.coverage.d3.score_complete)} completed score rows; no player tables, ratings or forecasts</td><td><Link href="/football/matchups/?division=3">Open D3 results →</Link></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">02 / Football player evidence</div>
            <h2>Every role has a visible source boundary.</h2>
          </div>
          <span className="note">
            Generated {date(footballEvents.generated_at)}
          </span>
        </div>
        <p className="note">
          The identified archive and the event notebook are complementary. Box
          rows use source athlete IDs and support player profiles; defensive and
          specialist releases carry names and game context without stable
          athlete IDs, so they remain separate and are never name-joined. The
          Player-game release is listed separately because it
          carries contest context but no stable athlete ID.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Evidence layer</th>
                <th className="numeric">Rows</th>
                <th>Season span</th>
                <th className="numeric">Games</th>
                <th>Identity / next step</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Identified player box archive</strong>
                  <small>{footballPlayerRecords.toLocaleString()} player/program/season records</small>
                </td>
                <td className="numeric">{footballArchiveRows.toLocaleString()}</td>
                <td>
                  {footballPlayerCatalog.seasons[0]?.season}–
                  {footballPlayerCatalog.seasons[footballPlayerCatalog.seasons.length - 1]?.season}
                </td>
                <td className="numeric">
                  {footballPlayerCatalog.seasons.reduce((sum, season) => sum + season.box_games, 0).toLocaleString()}
                </td>
                <td>
                  <small>Source athlete IDs; offensive and retained box categories.</small>
                  <Link href="/football/players/">Open identified player index →</Link>
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Player-game archive</strong>
                  <small>{footballNcaaReceipts.length} source editions; names and contest context retained</small>
                </td>
                <td className="numeric">{football.coverage.ncaa_player_stats_rows.toLocaleString()}</td>
                <td>
                  {footballNcaaSeasons[0]}–{footballNcaaSeasons[footballNcaaSeasons.length - 1]}
                </td>
                <td className="numeric">—</td>
                <td>
                  <small>No stable athlete ID; never joined to another player archive by name.</small>
                  <Link href="/football/source-stats/?dataset=ncaa_player_stats&season=2025">Open retained player rows →</Link>
                  {footballNcaaLatest?.url && (
                    <span>
                      Latest release receipt ↗
                    </span>
                  )}
                </td>
              </tr>
              {(["defense", "specialists"] as const).map((dataset) => {
                const editions = footballEvents.editions.filter((edition) => edition.dataset === dataset);
                const rows = editions.reduce((sum, edition) => sum + edition.coverage.records, 0);
                const games = editions.reduce((sum, edition) => sum + edition.coverage.games, 0);
                const label = dataset === "defense" ? "Defensive event notebook" : "Specialist event notebook";
                return (
                  <tr key={dataset}>
                    <td>
                      <strong>{label}</strong>
                      <small>{editions.length} source editions · {footballEventSeasons[0]}–{footballEventSeasons[footballEventSeasons.length - 1]}</small>
                    </td>
                    <td className="numeric">{rows.toLocaleString()}</td>
                    <td>{footballEventSeasons[0]}–{footballEventSeasons[footballEventSeasons.length - 1]}</td>
                    <td className="numeric">{games.toLocaleString()}</td>
                    <td>
                      <small>Name, team and game IDs; no stable athlete ID.</small>
                      <Link href={`/football/events/?dataset=${dataset}`}>Open event notebook →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note">
          The two event notebooks contain {footballEventRows.toLocaleString()} source
          records across {footballEventGames.toLocaleString()} game contexts. A
          repeated name is kept as a separate source row and is not a career total.
        </p>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">03 / Basketball evidence inventory</div>
            <h2>Every stat layer has a receipt.</h2>
          </div>
          <span className="note">
            {count(basketball.coverage.datasets?.length ?? 0)} published layers
          </span>
        </div>
        <p className="note">
          Row counts are table-local source records. They are not deduplicated
          person counts, and identities from retained editions are kept separate
          from retained records unless an exact source key is available.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Evidence layer</th>
                <th className="numeric">Rows</th>
                <th>Season span</th>
                <th>Latest source check</th>
                <th>Identity / provenance</th>
              </tr>
            </thead>
            <tbody>
              {(basketball.coverage.datasets ?? []).map((dataset) => (
                <tr key={dataset.key}>
                  <td>
                    <strong>{neutralText(dataset.label)}</strong>
                    <small>{dataset.source_count.toLocaleString()} source receipts</small>
                  </td>
                  <td className="numeric">{dataset.rows.toLocaleString()}</td>
                  <td>
                    {dataset.seasons.length
                      ? `${dataset.seasons[0]}–${dataset.seasons[dataset.seasons.length - 1]}`
                      : "—"}
                  </td>
                  <td>
                    {dataset.latest_source_at ? date(dataset.latest_source_at) : "—"}
                    {dataset.source_url && (
                      <small>
                        <span>Edition receipt recorded</span>
                      </small>
                    )}
                  </td>
                  <td><small>{neutralText(dataset.identity_note)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!basketball.coverage.datasets?.length && (
          <p className="empty">The inventory will appear after the next basketball build.</p>
        )}
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">04 / Player box field inventory</div>
            <h2>See the stats behind the rankings.</h2>
          </div>
          <span className="note">Built {date(playerBoxFields.generated_at)}</span>
        </div>
        <p className="note">
          The player-game warehouse retains {count(playerBoxFields.fields.length)} fields
          across {count(playerBoxFields.seasons.length)} seasons. This is the actual
          field inventory used for player tables, shooting splits and derived rates;
          a blank share stays blank instead of being filled by inference.
        </p>
        <div className="strip">
          <div>
            <strong>{count(playerBoxFields.fields.length)}</strong>
            <span>Tracked player fields</span>
          </div>
          <div>
            <strong>{count(playerBoxFields.seasons.length)}</strong>
            <span>Seasons in the archive</span>
          </div>
          <div>
            <strong>{count(latestPlayerBoxFields?.rows ?? 0)}</strong>
            <span>Rows in the latest season</span>
          </div>
          <div>
            <strong>{count(completeLatestPlayerBoxFields)}</strong>
            <span>Latest fields observed on every row</span>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Group</th>
                <th className="numeric">Latest rows</th>
                <th className="numeric">Latest share</th>
                <th className="numeric">Seasons observed</th>
              </tr>
            </thead>
            <tbody>
              {playerBoxFieldRows.map((row) => (
                <tr key={row.field}>
                  <td><strong>{row.field}</strong></td>
                  <td>{row.group}</td>
                  <td className="numeric">{count(row.latest?.observed ?? 0)}</td>
                  <td className="numeric">{row.latest ? `${(row.latest.share * 100).toFixed(1)}%` : "—"}</td>
                  <td className="numeric">{count(row.seasonsObserved)} / {count(playerBoxFields.seasons.length)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          Core totals cover minutes, points, rebounds, assists, steals, blocks,
          fouls, turnovers and offensive possessions. Shot-zone and context fields
          preserve rim, midrange, three-point, transition, half-court and assisted
          splits for deeper player comparisons.
        </p>
      </section>

      <CoverageLive />

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">05 / Supplemental research archives</div>
            <h2>The deeper player and possession files.</h2>
          </div>
          <span className="note">Source-native and derived layers</span>
        </div>
        <p className="note">
          These archives power the historical player, shooting, lineup, team-box
          and impact desks. Their rows are not interchangeable identities: records
          stay in their own namespace, and derived profiles retain their
          source season and edition.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Archive</th>
                <th className="numeric">Rows</th>
                <th>Season span</th>
                <th>Latest build</th>
                <th>Scope</th>
              </tr>
            </thead>
            <tbody>
              {supplemental.map((archive) => (
                <tr key={archive.key}>
                  <td>
                    <strong>{neutralText(archive.label)}</strong>
                    {archive.url && (
                      <small>
                        <span>Edition receipt recorded</span>
                      </small>
                    )}
                  </td>
                  <td className="numeric">{archive.rows.toLocaleString()}</td>
                  <td>
                    {archive.seasons[0]}–
                    {archive.seasons[archive.seasons.length - 1]}
                  </td>
                  <td>{date(archive.latest)}</td>
                  <td><small>{neutralText(archive.note)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">06 / Identity review queue</div>
            <h2>Missing IDs do not mean missing observations.</h2>
          </div>
          <span className="note">{count(unresolvedObserved)} rows retain source values</span>
        </div>
        <p className="note">
          Source rows are withheld from player and team joins when a required
          identifier is absent. The original payload stays in the private
          warehouse; this summary counts whether useful source fields remain,
          without guessing an identity or promoting the row into a ranking.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Dataset</th><th>Reason withheld</th><th className="numeric">Rows</th><th className="numeric">Rows with source observations</th></tr></thead>
            <tbody>{unresolvedBreakdown.map((row) => <tr key={`${row.dataset}-${row.reason}`}><td><strong>{neutralText(row.dataset)}</strong></td><td>{neutralText(row.reason)}</td><td className="numeric">{count(row.rows)}</td><td className="numeric">{count(row.rows_with_observed_stats)}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="note">
          These rows remain excluded from player rankings, career totals and
          forecast features until the source supplies a stable join key. A
          source value is not silently attributed to a nearby player.
        </p>
        <p className="note">
          <Link href="/basketball/identity-review/">Open the retained source rows →</Link>
          {" "}Search and download a bounded page when auditing a retained edition.
        </p>
      </section>

      <section className="section two-col">
        <article className="paper-panel">
          <div className="eyebrow">07 / Recruiting file</div>
          <h2>Useful evidence, clearly partial.</h2>
          <div className="rule-list">
            <div>
              <span>Programs with reviewed announcements</span>
              <strong>{count(recruiting.coverage.programs)}</strong>
            </div>
            <div>
              <span>People with dated records</span>
              <strong>{count(recruiting.coverage.players)}</strong>
            </div>
            <div>
              <span>Announcement events</span>
              <strong>{count(recruiting.coverage.events)}</strong>
            </div>
            <div>
              <span>Observed 2026–27 roster listings</span>
              <strong>{count(rosters.players_observed)}</strong>
            </div>
            {rosterSnapshots.map((snapshot) => (
              <div key={snapshot.season}>
                <span>
                  {snapshot.season - 1}–{String(snapshot.season).slice(-2)} source roster snapshot
                </span>
                <strong>
                  {count(snapshot.players_observed)} · {count(snapshot.teams_observed)} programs
                </strong>
              </div>
            ))}
            <div>
              <span>Programs in roster source view</span>
              <strong>{count(rosters.teams_observed)}</strong>
            </div>
            <div>
              <span>Roster publisher profiles linked</span>
              <strong>{count(rosterSourceProfiles)}</strong>
            </div>
            <div>
              <span>Roster rows with publisher Box BPM</span>
              <strong>
                {count(rosterBpmRows)}{rosterBpmShare == null ? "" : ` · ${rosterBpmShare.toFixed(1)}%`}
              </strong>
            </div>
          </div>
          <p className="note">
            School announcements are retained with source links and dates. A
            signing does not establish eligibility or availability, and an
            absent listing does not establish departure. Box BPM is source-
            attributed prior-season context and stays blank when its exact
            athlete/team row is unavailable. The review is not a national
            recruiting census.
          </p>
          <p>
            <Link href="/basketball/recruiting/">Read the recruiting file →</Link>
          </p>
        </article>

        <article className="paper-panel">
          <div className="eyebrow">08 / Forecast record</div>
          <h2>Predictions have a clock.</h2>
          <div className="rule-list">
            <div>
              <span>Football registered versions</span>
              <strong>{count(footballLedger.registered_versions)}</strong>
            </div>
            <div>
              <span>Basketball registered versions</span>
              <strong>{count(basketballLedger.registered_versions)}</strong>
            </div>
            <div>
              <span>Confirmed-start games</span>
              <strong>
                {count(
                  (footballLedger.status_counts.scheduled || 0) +
                    (basketballLedger.status_counts.scheduled || 0),
                )}
              </strong>
            </div>
            <div>
              <span>Football market observations</span>
              <strong>
                {count(marketBySport.football.observations)} · {count(marketBySport.football.games)} games
              </strong>
            </div>
            <div>
              <span>Basketball market observations</span>
              <strong>
                {count(marketBySport.basketball.observations)} · {count(marketBySport.basketball.games)} games
              </strong>
            </div>
            <div>
              <span>Settled games in the prospective record</span>
              <strong>
                {count(
                  (footballLedger.metrics.games || 0) +
                    (basketballLedger.metrics.games || 0),
                )}
              </strong>
            </div>
          </div>
          <p className="note">
            The archive currently retains {count(marketBySport.football.observations)}
            football observations across {count(marketBySport.football.games)} games
            from the prospective schedule. Basketball has {count(marketBySport.basketball.observations)}
            qualifying observations in this edition. Historical imported lines
            without a verified clock remain outside market evaluation, and
            retained reading snapshots stay separate from the scorecard.
          </p>
          <p>
            <Link href="/research/scorecard/">Open the prospective record →</Link>
          </p>
        </article>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
          <div className="eyebrow">09 / Basketball data library</div>
            <h2>Choose the evidence layer.</h2>
          </div>
          <span className="note">Each dataset keeps its own source identity.</span>
        </div>
        <div className="article-grid">
          <article className="paper-panel">
            <div className="eyebrow">Player archive</div>
            <h3>{count(history.seasons.reduce((n, s) => n + s.identified_rows, 0))} identified box rows</h3>
            <p>
              {history.seasons.length} source seasons and {count(history.player_ids)}{" "}
              archived player identities, with game logs and field-level coverage.
            </p>
            <Link href="/basketball/players/">Open player statistics →</Link>
          </article>
          <article className="paper-panel">
            <div className="eyebrow">Roster workload</div>
            <h3>{count(rosters.players_observed)} source-listed players</h3>
            <p>
              Rank the 2026–27 roster release by prior minutes, scoring,
              playmaking or shooting efficiency while keeping source status and
              player evidence visible.
            </p>
            <Link href="/basketball/roster-board/">Open the roster workload board →</Link>
          </article>
          <article className="paper-panel">
            <div className="eyebrow">Publisher context</div>
            <h3>{publisher.metrics.length} source-native leaderboards</h3>
            <p>
              Preserve the publisher’s labels and display values alongside
              Silvermine’s derived production rates.
            </p>
            <Link href="/basketball/leaders/">Open national leaders →</Link>
          </article>
          <article className="paper-panel">
            <div className="eyebrow">National snapshot</div>
            <h3>{count(ncaa.coverage.players)} national records</h3>
            <p>
              Final individual tables across {Object.keys(ncaa.coverage.divisions).length}{" "}
              divisions, with publisher ranks and missing-field coverage visible.
            </p>
            <Link href="/basketball/ncaa/">Open national leaderboards →</Link>
          </article>
          <article className="paper-panel">
            <div className="eyebrow">Boutique context</div>
            <h3>{count(impact.players.length)} RAPM records · {count(shooting.coverage.field_goal_attempts)} shots</h3>
            <p>
              Read possession impact and shot-location evidence without joining
              separate source IDs by name.
            </p>
            <p>
              <Link href="/basketball/impact/">Player impact →</Link>{" "}
              · <Link href="/basketball/shooting/">Shooting lab →</Link>
            </p>
          </article>
          <article className="paper-panel">
            <div className="eyebrow">Shot-location validation</div>
            <h3>{count(locatedShots)} located attempts{locationShare == null ? "" : ` · ${locationShare.toFixed(1)}% usable`}</h3>
            <p>
              Coordinates are retained only when they fall inside the court
              bounds and agree with the stated shot type, value and distance.
              {rejectedLocationShots ? ` ${count(rejectedLocationShots)} attempts remain visible as rejected location evidence.` : " No location rejects are present in this edition."}
            </p>
            <div className="rule-list">
              <div><span>Player games reconciled to box scores</span><strong>{count(shooting.coverage.matched_player_games ?? 0)} / {count(shooting.coverage.player_games ?? 0)}</strong></div>
              <div><span>Inconsistent coordinates</span><strong>{count(shotLocations.inconsistent ?? 0)}</strong></div>
              <div><span>Placeholder coordinates</span><strong>{count(shotLocations.placeholder ?? 0)}</strong></div>
              <div><span>Missing coordinates</span><strong>{count(shotLocations.missing ?? 0)}</strong></div>
            </div>
            <p className="note">A located attempt is event evidence, not optical tracking. Rejected or unmatched rows stay out of location-derived summaries rather than being repaired by inference.</p>
            <Link href="/basketball/shooting/">Open the shooting evidence →</Link>
          </article>
          <article className="paper-panel">
            <div className="eyebrow">Play by play</div>
            <h3>{count(shooting.coverage.pbp_events || 0)} events · {count(shooting.coverage.pbp_games || 0)} games</h3>
            <p>
              A searchable game index connects the retained event releases to
              the publisher&apos;s complete source pages and shot reconciliation.
            </p>
            <Link href="/basketball/pbp/">Open the play-by-play archive →</Link>
          </article>
        </div>
      </section>

      <section className="section banner">
        <div>
          <div className="eyebrow">10 / Source boundary</div>
          <h3 style={{ marginTop: 12 }}>Attribution is part of the statistic.</h3>
          <p>
            Current releases come from the retained bulk
            store. Direct extraction is disabled when terms or licensing prohibit it, and
            requests stop when robots policy disallows crawling. Missing
            values remain missing; names are never used to invent identities.
          </p>
        </div>
        <Link className="button secondary" href="/research/briefs/">
          Browse retained briefs ↗
        </Link>
      </section>

      <p className="note">
        Football edition {date(football.generated_at)} · basketball edition{" "}
        {date(basketball.generated_at)} · ledger edition {date(ledger.generated_at)}.
        Source receipt timestamps and hashes are available from each desk’s
        methodology page.
      </p>
    </>
  );
}
