import Link from "next/link";
import {
  getBasketball,
  getRosters,
  getRecruiting,
  getRosterModel,
} from "../_lib/basketball-data";
import { date, fmt } from "../_lib/format";
import BasketballCard from "../_components/BasketballCard";
import fs from "node:fs";
import path from "node:path";
import {
  topBasketballLeaders,
  type BasketballLeaderMetric,
  type BasketballLeaderPlayer,
} from "../_lib/basketball-leaders";
import { seasonLabel } from "../_lib/careers";
import type { BBDatasetCoverage } from "../_lib/basketball-types";
import LiveBasketballForecastStatus from "../_components/LiveBasketballForecastStatus";
import LiveBasketballRecruitingStatus from "../_components/LiveBasketballRecruitingStatus";
import LiveBasketballProspectStatus from "../_components/LiveBasketballProspectStatus";
import LiveBasketballMarketStatus from "../_components/LiveBasketballMarketStatus";
import LiveBasketballNewsStatus from "../_components/LiveBasketballNewsStatus";
import LiveBasketballScheduleStatus from "../_components/LiveBasketballScheduleStatus";
import LiveBasketballPlayerArchiveStatus from "../_components/LiveBasketballPlayerArchiveStatus";

function getBasketballLeaders(season: number) {
  const file = path.join(
    process.cwd(),
    "public/data/basketball/history",
    `players-${season - 1}.json`,
  );
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
    season: number;
    players: BasketballLeaderPlayer[];
  };
  const metrics: BasketballLeaderMetric[] = ["ppg", "rpg", "apg", "ts"];
  return {
    season: data.season,
    boards: Object.fromEntries(
      metrics.map((metric) => [metric, topBasketballLeaders(data.players, metric)]),
    ) as Record<
      BasketballLeaderMetric,
      ReturnType<typeof topBasketballLeaders>
    >,
  };
}

function getBasketballNews() {
  const file = path.join(process.cwd(), "public/data/news.json");
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
    articles?: Array<{
      id: string;
      headline: string;
      description: string;
      published: string;
      link: string;
      publisher?: string;
      sport?: string;
    }>;
  };
  return (data.articles || [])
    .filter((article) => article.sport === "mens-college-basketball")
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, 4);
}

const leaderMetricLabels: Record<BasketballLeaderMetric, string> = {
  ppg: "Points per game",
  rpg: "Rebounds per game",
  apg: "Assists per game",
  ts: "True shooting",
};

function receiptStatus(dataset: BBDatasetCoverage, editionAt: string) {
  if (!dataset.latest_source_at) {
    return { label: "Derived layer", className: "derived", detail: "Built from retained source rows" };
  }
  const lag = Math.max(
    0,
    Math.floor(
      (Date.parse(editionAt) - Date.parse(dataset.latest_source_at)) /
        (24 * 60 * 60 * 1000),
    ),
  );
  if (lag <= 1) return { label: "Current receipt", className: "current", detail: "Receipt is within one day of this edition" };
  if (lag <= 7) return { label: "Aging receipt", className: "aging", detail: `${lag} days behind this edition` };
  return { label: "Review receipt", className: "review", detail: `${lag} days behind this edition` };
}

function sourceSeasonRange(dataset: BBDatasetCoverage | undefined) {
  const seasons = [...(dataset?.seasons ?? [])].sort((a, b) => a - b);
  if (!seasons.length) return "archive";
  if (seasons.length === 1) return seasonLabel(seasons[0]);
  return `${seasonLabel(seasons[0])} through ${seasonLabel(seasons.at(-1)!)}`;
}

export const metadata = {
  title: "2026–27 basketball stats, scouting and recruiting research",
};
export default function Page() {
  const d = getBasketball(),
    r = getRosters(),
    recruiting = getRecruiting(),
    rosterModel = getRosterModel(),
    e = d.model.evaluation,
    playerBoxDataset = d.coverage.datasets?.find((dataset) => dataset.key === "player_box"),
    leaders = getBasketballLeaders(d.season),
    news = getBasketballNews();
  return (
    <>
      <div className="dateline eyebrow">
        <span>Men’s college basketball · {d.label}</span>
        <span>Edition {date(d.generated_at)}</span>
      </div>
      <section className="hero basketball-hero">
        <div className="hero-copy">
          <div className="eyebrow">A new season. A deeper scouting book.</div>
          <h1>
            See the game
            <br />
            <em>before it happens.</em>
          </h1>
          <p>
            Opponent-adjusted efficiency. Real player production. Dated
            recruiting evidence. Turn the next matchup into a better game plan.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/basketball/gameplan/">
              Open the game plan ↗
            </Link>
            <Link className="hero-link" href="/basketball/coach/">
              Open the coach&apos;s desk →
            </Link>
            <Link className="hero-link" href="/basketball/briefs/">
              Read the game briefs →
            </Link>
            <Link className="hero-link" href="/basketball/recruiting/">
              Study recruiting evidence →
            </Link>
            <Link className="hero-link" href="/basketball/pressroom/">
              Find the next story angle →
            </Link>
            <Link className="hero-link" href="/basketball/learn/">
              Learn the metrics →
            </Link>
          </div>
        </div>
        <div className="field">
          <div className="field-card">
            <div className="eyebrow">The independent test / 2025–26</div>
            <div className="score-line">
              <span>Winner accuracy</span>
              <strong>{fmt(e.winner_accuracy * 100)}%</strong>
            </div>
            <div className="score-line">
              <span>Margin error</span>
              <strong>{fmt(e.margin_mae)}</strong>
            </div>
            <div className="field-note">
              {e.games.toLocaleString()} HELD-OUT GAMES
              <br />
              CALIBRATION: 2024–25 · TEST: 2025–26
              <br />
              MODEL {d.model.version}
            </div>
          </div>
        </div>
      </section>
      <div className="strip">
        <div>
          <strong>{d.coverage.player_box_rows.toLocaleString()}</strong>
          <span>Player box-score records · {sourceSeasonRange(playerBoxDataset)}</span>
        </div>
        <div>
          <strong>{d.coverage.forecast_games.toLocaleString()}</strong>
          <span>Published 2026–27 forecasts</span>
        </div>
        <div>
          <strong>{r.players_observed.toLocaleString()}</strong>
          <span>Players on observed 2026–27 rosters</span>
        </div>
        <div>
          <strong>{d.ratings.length}</strong>
          <span>Programs with efficiency ratings</span>
        </div>
      </div>
      <LiveBasketballForecastStatus />
      <LiveBasketballRecruitingStatus />
      <LiveBasketballProspectStatus />
      <LiveBasketballPlayerArchiveStatus />
      <LiveBasketballMarketStatus />
      <LiveBasketballScheduleStatus />
      <section className="section coach-path" aria-labelledby="coach-path-title">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Coach&apos;s research path</div>
            <h2 id="coach-path-title">Move from a question to the next piece of evidence.</h2>
          </div>
          <Link href="/basketball/learn/">How the measures work →</Link>
        </div>
        <p className="note" style={{ marginBottom: 20 }}>
          Start with the decision in front of you. Each stop keeps source
          identity, workload and uncertainty attached as you move through the
          book.
        </p>
        <div className="article-grid">
          <article className="article-card">
            <div className="eyebrow">01 / Prepare</div>
            <h3>What will decide the next game?</h3>
            <p>
              Build a matchup plan from the published forecast, Four Factors
              and the roster context we have actually observed.
            </p>
            <Link href="/basketball/gameplan/">Open the game-plan desk →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">02 / Evaluate</div>
            <h3>Which player deserves a closer look?</h3>
            <p>
              Filter NCAA production and impact by a minimum sample, then
              shortlist up to three exact source IDs for side-by-side review.
            </p>
            <Link href="/basketball/ncaa-rankings/">Open NCAA rankings →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">03 / Verify</div>
            <h3>What changed on the roster?</h3>
            <p>
              Pair dated school announcements with prior college production and
              NCAA roster records. A signing is a lead to verify, not a claim of
              current availability.
            </p>
            <Link href="/basketball/recruiting/">Open recruiting evidence →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">04 / Trace</div>
            <h3>How fresh is the number?</h3>
            <p>
              Check the source receipt, row count and identity note for every
              archive layer before carrying a stat into a staff conversation.
            </p>
            <Link href="/research/coverage/">Open the coverage desk →</Link>
          </article>
        </div>
      </section>
      <section className="section source-receipts">
        <div className="section-heading">
          <div>
            <div className="eyebrow">00 / Source receipts</div>
            <h2>Know how recent the evidence is.</h2>
          </div>
          <Link href="/research/coverage/">Full coverage desk →</Link>
        </div>
        <p className="note">
          Each layer carries its own source timestamp. The label compares that
          receipt with this edition build; derived layers have no separate
          fetch and stay identified as derived.
        </p>
        <div className="source-receipt-grid">
          {(d.coverage.datasets ?? []).map((dataset) => {
            const status = receiptStatus(dataset, d.generated_at);
            return (
              <article className="source-receipt" key={dataset.key}>
                <div className={`source-receipt-status ${status.className}`}>
                  <span aria-hidden="true" />
                  {status.label}
                </div>
                <h3>{dataset.label}</h3>
                <div className="source-receipt-meta">
                  <span>{dataset.rows.toLocaleString()} rows</span>
                  <span>{dataset.seasons.length} seasons</span>
                </div>
                <p>{status.detail}</p>
                {dataset.latest_source_at && (
                  <small>Last receipt · {date(dataset.latest_source_at)}</small>
                )}
                {dataset.identity_note && <small>{dataset.identity_note}</small>}
                {dataset.source_url && (
                  <a className="text-link" href={dataset.source_url} target="_blank" rel="noreferrer">
                    Open source release ↗
                  </a>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">01 / The next matchup</div>
            <h2>The season takes shape.</h2>
          </div>
          <Link href="/basketball/matchups/">Full published slate →</Link>
          <Link href="/basketball/briefs/">Browse game briefs →</Link>
          <Link href="/basketball/forecast-lab/">Compare model scenarios →</Link>
        </div>
        <p className="note" style={{ marginBottom: 20 }}>
          The source has published {d.coverage.upcoming_games.toLocaleString()}{" "}
          games so far. {d.coverage.baseline_estimate_games || 0} carry a
          labeled cold-start estimate because a program is outside the primary
          trained field. This is a partial schedule, not the complete season.
        </p>
        <div className="match-grid">
          {d.upcoming
            .filter((g) => g.prediction || g.fallback_prediction)
            .slice(0, 3)
            .map((g) => {
              const rosterScenario = rosterModel.scenarios.find(
                (scenario) => scenario.game_id === g.id,
              );
              return (
                <BasketballCard
                  key={g.id}
                  game={g}
                  homeRoster={r.team_summaries?.find((summary) => summary.team_id === g.home_id)}
                  awayRoster={r.team_summaries?.find((summary) => summary.team_id === g.away_id)}
                  rosterScenario={rosterScenario}
                />
              );
            })}
        </div>
      </section>
      {leaders && (
        <section className="section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">02 / Player production</div>
              <h2>Start with the player file.</h2>
            </div>
            <div className="button-row"><Link href="/basketball/players/">Full player archive →</Link><Link href="/basketball/ncaa-rankings/">NCAA player rankings →</Link><Link href="/basketball/ncaa-compare/">Compare NCAA players →</Link></div>
          </div>
          <p className="note" style={{ marginBottom: 20 }}>
            Qualified {seasonLabel(leaders.season)} source records, ranked
            within each measure. Qualification requires at least 15 games and
            400 minutes; this describes recorded production, not a projection.
          </p>
          <div className="basketball-leader-grid">
            {(["ppg", "rpg", "apg", "ts"] as BasketballLeaderMetric[]).map(
              (metric) => (
                <div className="paper-panel" key={metric}>
                  <div className="eyebrow">{leaderMetricLabels[metric]}</div>
                  <div className="basketball-leader-list">
                    {leaders.boards[metric].map((player) => (
                      <Link
                        className="basketball-leader-row"
                        href={`/basketball/player/?id=${encodeURIComponent(player.id)}&season=${leaders.season}`}
                        key={player.id}
                      >
                        <span className="rank-number">{player.rank}</span>
                        <span>
                          <strong>{player.name}</strong>
                          <small>
                            {player.team} · {player.games} GP
                          </small>
                        </span>
                        <span className="numeric">
                          {metric === "ts"
                            ? `${fmt(player.value * 100)}%`
                            : fmt(player.value)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        </section>
      )}
      <section className="section two-col">
        <div>
          <div className="section-heading">
            <div>
              <div className="eyebrow">03 / Both ends of the floor</div>
              <h2>Quality beyond tempo.</h2>
            </div>
            <Link href="/basketball/ratings/">Full table →</Link>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Program</th>
                  <th className="numeric">Adj O</th>
                  <th className="numeric">Adj D</th>
                  <th className="numeric">Net</th>
                  <th className="numeric">Luck</th>
                </tr>
              </thead>
              <tbody>
                {d.ratings.slice(0, 10).map((t) => (
                  <tr key={t.id}>
                    <td className="rank-number">{t.rank}</td>
                    <td>
                      <Link href={`/basketball/programs/${t.id}/`}>
                        {t.name}
                      </Link>
                    </td>
                    <td className="numeric">{fmt(t.adj_off)}</td>
                    <td className="numeric">{fmt(t.adj_def)}</td>
                    <td className="numeric">{fmt(t.adj_net)}</td>
                    <td className="numeric">
                      {t.luck == null ? "—" : `${fmt(t.luck)} pp`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Points per 100 estimated possessions, opponent-adjusted with ridge
            regression. Lower defensive efficiency is better. Luck is actual
            wins minus model-expected wins in percentage points.
          </p>
        </div>
        <aside className="paper-panel">
          <div className="eyebrow">04 / Roster construction</div>
          <h2 style={{ marginTop: 22 }}>
            Know what changed.
            <br />
            Know what is unknown.
          </h2>
          <p>
            School announcements connect incoming players to prior college
            production. See the original signing and any later availability
            statement side by side.
          </p>
          <div className="rule-list">
            <div>
              <span>Announced additions</span>
              <strong>{recruiting.coverage.players}</strong>
            </div>
            <div>
              <span>Reviewed / source-listed programs</span>
              <strong>
                {recruiting.coverage.programs}/
                {(r.team_summaries || []).length.toLocaleString()}
              </strong>
            </div>
            <div>
              <span>Reviewed historical stat links</span>
              <strong>{recruiting.coverage.historical_links}</strong>
            </div>
          </div>
          <p>
            Coverage is partial, even within reviewed programs. A signing alone
            does not establish eligibility or current availability.
          </p>
          <p>
            <Link href="/basketball/recruiting/">
              Open the recruiting file →
            </Link>
          </p>
          <p>
            <Link href="/basketball/ncaa-rosters/">
              Browse NCAA roster and high-school context →
            </Link>
          </p>
        </aside>
      </section>
      <section className="section banner">
        <div>
          <div className="eyebrow">05 / Player evaluation</div>
          <h3 style={{ marginTop: 12 }}>Production meets lineup context.</h3>
          <p>
            Browse box-score rates and shooting efficiency, then study the
            publisher’s NCAA league-wide regularized adjusted plus-minus
            rankings. Source identities remain separate where a match has not
            been verified.
          </p>
        </div>
        <Link className="button secondary" href="/basketball/impact/">
          Explore player impact ↗
        </Link>
        <Link className="hero-link" href="/basketball/ncaa/">
          Browse NCAA national leaderboards →
        </Link>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">06 / Learn from the archive</div>
            <h2>Turn a stat into a better question.</h2>
          </div>
          <Link href="/blog/">Read the full journal →</Link>
        </div>
        <p className="note" style={{ marginBottom: 20 }}>
          Short field guides explain the measures behind the boards and show
          how to carry source identity, workload and uncertainty into film or
          recruiting review.
        </p>
        <div className="article-grid">
          <article className="article-card">
            <div className="eyebrow">Player evaluation</div>
            <h2>A ranking is a question, not a verdict.</h2>
            <p>
              Use production and impact screens to choose the next piece of
              evidence, while keeping samples and exact source IDs attached.
            </p>
            <Link href="/blog/basketball-ranking-playbook/">Read the ranking playbook →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">Team context</div>
            <h2>Count the trip before you count the score.</h2>
            <p>
              Read transition, assisted and garbage-time possession shares as
              team context without assigning possession credit to a player.
            </p>
            <Link href="/blog/basketball-possession-style/">Read the possession guide →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">Recruiting evidence</div>
            <h2>Recruit the role before you recruit the name.</h2>
            <p>
              Connect source-listed roles and prior workload to a transparent
              shortlist, then verify announcements and game evidence.
            </p>
            <Link href="/blog/basketball-recruiting-fit/">Read the recruiting guide →</Link>
          </article>
        </div>
      </section>
      {news.length > 0 && <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">07 / Publisher wire</div>
            <h2>Keep the current context close.</h2>
          </div>
          <Link href="/basketball/news/">Open the full news archive →</Link>
        </div>
        <p className="note" style={{ marginBottom: 20 }}>
          A source-linked feed of ESPN and NCAA.com headlines for recruiting,
          eligibility and basketball context. Silvermine retains only the
          publisher-supplied headline, summary, date and URL; the wire is not a
          transaction or availability ledger.
        </p>
        <LiveBasketballNewsStatus />
        <div className="article-grid">
          {news.map((article) => <article className="article-card" key={article.id}>
            <div className="eyebrow">{date(article.published)} · {article.publisher || "Publisher"}</div>
            <h3>{article.headline}</h3>
            <p>{article.description}</p>
            <a href={article.link} target="_blank" rel="noreferrer">Read the source article ↗</a>
          </article>)}
        </div>
      </section>}
      <section className="section paper-panel">
        <div className="section-heading">
          <div>
            <div className="eyebrow">08 / Market evidence</div>
            <h2>Keep the forecast beside the line.</h2>
          </div>
          <Link href="/research/markets/?sport=basketball">Open the market archive →</Link>
        </div>
        <p>
          The research ledger compares a model with a market only when the
          quote has a provider update clock, an exact participant and start
          time match, and a captured-before-tip timestamp. Historical lines
          without that evidence remain labeled as archival reference instead
          of being treated as a betting edge.
        </p>
        <div className="article-grid">
          <article className="article-card">
            <div className="eyebrow">Forecast record</div>
            <h3>Measure the model on settled games.</h3>
            <p>Review margin error, winner accuracy, calibration and the source state behind every registered 2026–27 forecast.</p>
            <Link href="/research/scorecard/?sport=basketball">Open the basketball scorecard →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">Capture protocol</div>
            <h3>Read the clock with the number.</h3>
            <p>Browse provider, bookmaker, market, price and observed-time fields without turning a stale or unmatched quote into a recommendation.</p>
            <Link href="/research/markets/?sport=basketball#market-policy">Read the evidence policy →</Link>
          </article>
        </div>
      </section>
    </>
  );
}
