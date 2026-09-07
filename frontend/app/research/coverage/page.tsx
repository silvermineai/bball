import Link from "next/link";
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
  const recruiting = getRecruiting();
  const ledger = getLedger();
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
              The player archive spans 2022–26 and keeps defense/specialist
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

      <section className="section banner">
        <div>
          <div className="eyebrow">04 / Source boundary</div>
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
