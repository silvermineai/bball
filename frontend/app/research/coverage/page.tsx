import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { getBasketball, getRecruiting, getRosters } from "../../_lib/basketball-data";
import { getOverview } from "../../_lib/data";
import { getLedger } from "../../_lib/research-data";
import { date, fmt } from "../../_lib/format";

export const metadata = {
  title: "Coverage, sources and limitations",
  description:
    "A dated inventory of Silvermine football, basketball, player, recruiting and forecast coverage.",
};

const count = (value: number) => value.toLocaleString("en-US");

export default function Page() {
  const football = getOverview();
  const basketball = getBasketball();
  const rosters = getRosters();
  const rosterSourceProfiles = rosters.players.filter((player) => player.source_url).length;
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
    };
  };
  const publisher = JSON.parse(
    fs.readFileSync(path.join(dataDir, "publisher-leaders.json"), "utf8"),
  ) as { metrics: unknown[] };
  const supplemental = [
    {
      key: "career-player-box",
      label: "Historical player game archive",
      rows: history.seasons.reduce((sum, season) => sum + season.source_rows, 0),
      seasons: history.seasons.map((season) => season.season),
      latest: history.generated_at,
      url: history.sources[0]?.[0]?.url ?? null,
      note: "SportsDataverse box rows; source IDs and incomplete fields stay explicit.",
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
      note: "NCAA source matchup rows; names remain in the NCAA identity namespace.",
    },
    {
      key: "ncaa-team-box",
      label: "NCAA team-game archive",
      rows: ncaaTeamBox.seasons.reduce((sum, season) => sum + season.coverage.source_rows, 0),
      seasons: ncaaTeamBox.seasons.map((season) => season.season),
      latest: ncaaTeamBox.seasons.reduce((latest, season) => latest > season.generated_at ? latest : season.generated_at, ""),
      url: null,
      note: "NCAA-derived team rows with descriptive Four Factors and tempo.",
    },
    {
      key: "within-team-impact",
      label: "Within-team RAPM archive",
      rows: withinImpact.seasons.reduce((sum, season) => sum + season.coverage.source_rows, 0),
      seasons: withinImpact.seasons.map((season) => season.season),
      latest: withinImpact.seasons.reduce((latest, season) => latest > season.generated_at ? latest : season.generated_at, ""),
      url: null,
      note: "Source impact rows; qualification and possession samples remain visible.",
    },
  ];
  const footballLedger = ledger.sports.football;
  const basketballLedger = ledger.sports.basketball;

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
                <span>Historical player box rows</span>
                <strong>{count(football.coverage.box_rows)}</strong>
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
              Factors; NCAA RAPM stays in its own source identity namespace.
            </p>
            <p>
              <Link href="/basketball/model/">Open basketball methods →</Link>
            </p>
          </article>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">02 / Basketball evidence inventory</div>
            <h2>Every stat layer has a receipt.</h2>
          </div>
          <span className="note">
            {count(basketball.coverage.datasets?.length ?? 0)} published layers
          </span>
        </div>
        <p className="note">
          Row counts are table-local source records. They are not deduplicated
          person counts, and identities from NCAA releases are kept separate
          from ESPN-derived records unless an exact source key is available.
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
                    <strong>{dataset.label}</strong>
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
                        <a href={dataset.source_url} target="_blank" rel="noreferrer">
                          Source release ↗
                        </a>
                      </small>
                    )}
                  </td>
                  <td><small>{dataset.identity_note}</small></td>
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
            <div className="eyebrow">03 / Supplemental research archives</div>
            <h2>The deeper player and possession files.</h2>
          </div>
          <span className="note">Source-native and derived layers</span>
        </div>
        <p className="note">
          These archives power the historical player, shooting, lineup, team-box
          and impact desks. Their rows are not interchangeable identities: NCAA
          records stay in the NCAA namespace, and derived profiles retain their
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
                    <strong>{archive.label}</strong>
                    {archive.url && (
                      <small>
                        <a href={archive.url} target="_blank" rel="noreferrer">
                          Source release ↗
                        </a>
                      </small>
                    )}
                  </td>
                  <td className="numeric">{archive.rows.toLocaleString()}</td>
                  <td>
                    {archive.seasons[0]}–
                    {archive.seasons[archive.seasons.length - 1]}
                  </td>
                  <td>{date(archive.latest)}</td>
                  <td><small>{archive.note}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section two-col">
        <article className="paper-panel">
          <div className="eyebrow">02 / Recruiting file</div>
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
            <div>
              <span>Programs in roster source view</span>
              <strong>{count(rosters.teams_observed)}</strong>
            </div>
            <div>
              <span>Roster publisher profiles linked</span>
              <strong>{count(rosterSourceProfiles)}</strong>
            </div>
          </div>
          <p className="note">
            School announcements are retained with source links and dates. A
            signing does not establish eligibility or availability, and an
            absent listing does not establish departure. The review is not a
            national recruiting census.
          </p>
          <p>
            <Link href="/basketball/recruiting/">Read the recruiting file →</Link>
          </p>
        </article>

        <article className="paper-panel">
          <div className="eyebrow">03 / Forecast record</div>
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
            No verified pregame odds are currently stored. Historical imported
            lines without a publisher clock remain outside market evaluation.
            Retained reading snapshots are separate from the scorecard.
          </p>
          <p>
            <Link href="/research/scorecard/">Open the prospective record →</Link>
          </p>
        </article>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">04 / Basketball data library</div>
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
            <div className="eyebrow">NCAA snapshot</div>
            <h3>{count(ncaa.coverage.players)} national records</h3>
            <p>
              Final individual tables across {Object.keys(ncaa.coverage.divisions).length}{" "}
              divisions, with publisher ranks and missing-field coverage visible.
            </p>
            <Link href="/basketball/ncaa/">Open NCAA leaderboards →</Link>
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
          <div className="eyebrow">05 / Source boundary</div>
          <h3 style={{ marginTop: 12 }}>Attribution is part of the statistic.</h3>
          <p>
            Current releases come from the attributed SportsDataverse bulk
            store. Direct ESPN extraction is disabled under source terms, and
            NCAA requests stop when robots policy disallows crawling. Missing
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
