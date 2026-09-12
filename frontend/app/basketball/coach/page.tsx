import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import {
  getBasketball,
  getRecruiting,
  getRosters,
  getRosterModel,
} from "../../_lib/basketball-data";
import { date, fmt } from "../../_lib/format";
import { seasonLabel } from "../../_lib/careers";
import LiveBasketballForecastStatus from "../../_components/LiveBasketballForecastStatus";
import LiveBasketballRecruitingStatus from "../../_components/LiveBasketballRecruitingStatus";
import LiveBasketballMarketStatus from "../../_components/LiveBasketballMarketStatus";

export const metadata = {
  title: "Basketball coach's desk",
  description:
    "A coach-facing view of 2026–27 college basketball forecasts, player evidence, roster movement and model context.",
};

function getNews() {
  const file = path.join(process.cwd(), "public/data/news.json");
  if (!fs.existsSync(file)) return [];
  const payload = JSON.parse(fs.readFileSync(file, "utf8")) as {
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
  return (payload.articles || [])
    .filter((article) => article.sport === "mens-college-basketball")
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, 3);
}

export default function Page() {
  const basketball = getBasketball();
  const rosters = getRosters();
  const recruiting = getRecruiting();
  const rosterModel = getRosterModel();
  const upcoming = basketball.upcoming
    .filter((game) => game.prediction || game.fallback_prediction)
    .slice(0, 5);
  const rosterScenarioByGame = new Map(rosterModel.scenarios.map((scenario) => [scenario.game_id, scenario]));
  const rosterSummaries = (rosters.team_summaries || []).filter((team) => team.prior_minutes > 0);
  const movementRadar = [...rosterSummaries]
    .sort((a, b) => (b.unrepresented_prior_minutes || 0) - (a.unrepresented_prior_minutes || 0) || a.team.localeCompare(b.team))
    .slice(0, 6);
  const incomingRadar = [...rosterSummaries]
    .sort((a, b) => (b.incoming_prior_minutes || 0) - (a.incoming_prior_minutes || 0) || a.team.localeCompare(b.team))
    .slice(0, 6);
  const news = getNews();
  const evaluation = basketball.model.evaluation;

  return (
    <>
      <div className="dateline eyebrow">
        <span>Coach&apos;s desk · Men&apos;s college basketball</span>
        <span>{basketball.label} · {date(basketball.generated_at)}</span>
      </div>
      <section className="page-title">
        <div className="eyebrow">Prepare · evaluate · verify</div>
        <h1>The next decision, in one place.</h1>
        <p>
          A working brief for the staff meeting: start with the forecast, find
          the players and lineup context behind it, then verify every roster or
          recruiting lead against the source record.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/basketball/gameplan/">Open the game plan ↗</Link>
          <Link className="hero-link" href="/basketball/matchups/">Browse the full slate →</Link>
          <Link className="hero-link" href="/basketball/recruiting/">Review recruiting evidence →</Link>
        </div>
      </section>

      <section className="section" aria-label="Live publication checks" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <LiveBasketballForecastStatus />
        <LiveBasketballRecruitingStatus />
        <LiveBasketballMarketStatus />
      </section>

      <section className="section" aria-labelledby="coach-pulse-title">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Staff-room pulse</div>
            <h2 id="coach-pulse-title">What is ready for the next conversation.</h2>
          </div>
          <Link href="/research/coverage/">Audit source coverage →</Link>
        </div>
        <div className="strip coach-pulse-strip">
          <div><strong>{basketball.coverage.forecast_games.toLocaleString()}</strong><span>2026–27 forecast games</span></div>
          <div><strong>{basketball.ratings.length.toLocaleString()}</strong><span>Rated programs</span></div>
          <div><strong>{rosters.players_observed.toLocaleString()}</strong><span>Observed roster players</span></div>
          <div><strong>{recruiting.coverage.events.toLocaleString()}</strong><span>Dated recruiting events</span></div>
          <div><strong>{basketball.coverage.player_box_rows.toLocaleString()}</strong><span>Player box records</span></div>
        </div>
      </section>

      <section className="section" aria-labelledby="next-slate-title">
        <div className="section-heading">
          <div>
            <div className="eyebrow">01 / Prepare</div>
            <h2 id="next-slate-title">The next slate.</h2>
          </div>
          <Link href="/basketball/forecast-lab/">Compare scenarios →</Link>
        </div>
        <div className="article-grid">
          {upcoming.map((game) => {
            const prediction = game.prediction || game.fallback_prediction;
            const rosterScenario = rosterScenarioByGame.get(game.id);
            const confidence = prediction?.home_win_probability == null
              ? null
              : Math.max(prediction.home_win_probability, 1 - prediction.home_win_probability) * 100;
            return (
              <article className="article-card" key={game.id}>
                <div className="eyebrow">{date(game.starts_at)} · {game.neutral ? "Neutral" : "Home court"}</div>
                <h3>{game.away_name} at {game.home_name}</h3>
                <p>
                  Model projects {fmt(prediction?.home_score)}–{fmt(prediction?.away_score)}
                  {prediction?.home_win_probability != null
                    ? ` · ${fmt(prediction.home_win_probability * 100)}% home win probability`
                    : ""}.
                </p>
                <p className="note">
                  {prediction?.margin_low != null && prediction.margin_high != null
                    ? `80% margin range ${fmt(prediction.margin_low)} to ${fmt(prediction.margin_high)}`
                    : "Margin range unavailable"}
                  {confidence == null ? "" : ` · ${fmt(confidence)}% model confidence`}
                  {rosterScenario ? ` · roster lens ${rosterScenario.margin_delta > 0 ? "+" : ""}${fmt(rosterScenario.margin_delta)} pts` : ""}
                </p>
                {rosterScenario && <small>Roster lens is research-only and does not replace the primary forecast.</small>}
                <Link href={`/basketball/briefs/${encodeURIComponent(game.id)}/`}>Open the game brief →</Link>
              </article>
            );
          })}
          {upcoming.length === 0 && <p className="note">No forecasted games are currently published. The matchup desk will fill as the schedule release arrives.</p>}
        </div>
      </section>

      <section className="section two-col" aria-labelledby="decision-lanes-title">
        <div>
          <div className="section-heading">
            <div>
              <div className="eyebrow">02 / Evaluate</div>
              <h2 id="decision-lanes-title">Choose the evidence lane.</h2>
            </div>
          </div>
          <div className="article-grid">
            <article className="article-card"><div className="eyebrow">Player file</div><h3>Who is driving the result?</h3><p>Rank production, shooting and NCAA impact with games, minutes and exact source IDs attached.</p><Link href="/basketball/ncaa-rankings/">Open player rankings →</Link></article>
            <article className="article-card"><div className="eyebrow">Roster file</div><h3>What changed since last season?</h3><p>Separate returning workload, incoming prior production and unknown availability before changing a rotation assumption.</p><Link href="/basketball/roster-board/">Open roster workload →</Link></article>
            <article className="article-card"><div className="eyebrow">Matchup file</div><h3>Where is the pressure point?</h3><p>Read Four Factors, pace, lineup stints and game context together instead of treating one split as a game plan.</p><Link href="/basketball/matchup-stints/">Open matchup stints →</Link></article>
            <article className="article-card"><div className="eyebrow">Recruiting file</div><h3>Does the role fit the need?</h3><p>Connect dated school announcements to prior college production and transparent fit signals.</p><Link href="/basketball/recruiting/fit/">Open recruiting fit →</Link></article>
          </div>
        </div>
        <aside className="paper-panel">
          <div className="eyebrow">03 / Verify</div>
          <h2 style={{ marginTop: 20 }}>Carry the caveat with the number.</h2>
          <p>Silvermine estimates opponent-adjusted efficiency and win probabilities. They are a starting point for preparation, with roster and injury information still requiring staff verification.</p>
          <div className="rule-list">
            <div><span>Holdout season</span><strong>{seasonLabel(evaluation.season)}</strong></div>
            <div><span>Held-out games</span><strong>{evaluation.games.toLocaleString()}</strong></div>
            <div><span>Winner accuracy</span><strong>{fmt(evaluation.winner_accuracy * 100)}%</strong></div>
            <div><span>Margin error</span><strong>{fmt(evaluation.margin_mae)} pts</strong></div>
            <div><span>Roster scenarios</span><strong>{rosterModel.scenarios.length.toLocaleString()}</strong></div>
          </div>
          <p><Link href="/basketball/model/">Read the model notebook →</Link></p>
          <p><Link href="/research/scorecard/?sport=basketball">Check the forecast record →</Link></p>
        </aside>
      </section>

      <section className="section paper-panel" aria-labelledby="movement-radar-title">
        <div className="section-heading">
          <div>
            <div className="eyebrow">04 / Recruiting radar · national roster observations</div>
            <h2 id="movement-radar-title">Find the workload questions first.</h2>
          </div>
          <Link href="/basketball/recruiting/?view=observations">Open the full observation lab →</Link>
        </div>
        <p className="note">
          These rankings compare exact source player IDs across the retained roster and participation releases. “Unrepresented” is prior minutes without a matching current listing; “incoming” is prior minutes attached to a player listed at a different program. Neither field proves a portal move, eligibility or availability.
        </p>
        <div className="two-col">
          <div>
            <div className="eyebrow">Largest unrepresented workload</div>
            <div className="table-scroll" style={{ marginTop: 12 }}>
              <table className="data-table">
                <thead><tr><th>Program</th><th className="numeric">Prior minutes</th><th className="numeric">Unrepresented</th><th className="numeric">Listed</th></tr></thead>
                <tbody>{movementRadar.map((team) => <tr key={`unrepresented-${team.team_id}`}>
                  <td><Link href={`/basketball/programs/${encodeURIComponent(team.team_id)}/`}>{team.team}</Link></td>
                  <td className="numeric">{Math.round(team.prior_minutes).toLocaleString()}</td>
                  <td className="numeric"><strong>{Math.round(team.unrepresented_prior_minutes || 0).toLocaleString()}</strong></td>
                  <td className="numeric">{team.listed_players}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
          <div>
            <div className="eyebrow">Largest incoming prior workload</div>
            <div className="table-scroll" style={{ marginTop: 12 }}>
              <table className="data-table">
                <thead><tr><th>Program</th><th className="numeric">Incoming minutes</th><th className="numeric">Represented</th><th className="numeric">Listed</th></tr></thead>
                <tbody>{incomingRadar.map((team) => <tr key={`incoming-${team.team_id}`}>
                  <td><Link href={`/basketball/programs/${encodeURIComponent(team.team_id)}/`}>{team.team}</Link></td>
                  <td className="numeric"><strong>{Math.round(team.incoming_prior_minutes || 0).toLocaleString()}</strong></td>
                  <td className="numeric">{Math.round(team.represented_prior_minutes || 0).toLocaleString()}</td>
                  <td className="numeric">{team.listed_players}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>
        <p className="section-note">Source frame: {rosters.players_observed.toLocaleString()} listed players across {rosters.teams_observed.toLocaleString()} programs. Use the exact player rows and source links before treating a radar entry as a recruiting lead.</p>
      </section>

      {news.length > 0 && <section className="section" aria-labelledby="coach-wire-title">
        <div className="section-heading">
          <div><div className="eyebrow">05 / Context</div><h2 id="coach-wire-title">Keep the current story close.</h2></div>
          <Link href="/basketball/news/">Open the publisher wire →</Link>
        </div>
        <div className="article-grid">
          {news.map((article) => <article className="article-card" key={article.id}><div className="eyebrow">{date(article.published)} · {article.publisher || "Publisher"}</div><h3>{article.headline}</h3><p>{article.description}</p><a href={article.link} target="_blank" rel="noreferrer">Read the source article ↗</a></article>)}
        </div>
      </section>}

      <section className="section banner">
        <div><div className="eyebrow">06 / Keep the ledger honest</div><h3 style={{ marginTop: 12 }}>A missing quote is missing evidence.</h3><p>Compare forecasts with licensed, timestamped pregame observations when they exist. Historical lines without a verified clock stay archival references.</p></div>
        <div className="button-row"><Link className="button secondary" href="/research/scorecard/?sport=basketball">Forecast scorecard ↗</Link><Link className="hero-link" href="/research/markets/?sport=basketball">Market archive →</Link></div>
      </section>
    </>
  );
}
