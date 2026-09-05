import Link from "next/link";
import type { Game, Overview } from "../_lib/data";
import { getFootballBriefEvidence } from "../_lib/football-brief-data";
import { date, fmt, kick, signed } from "../_lib/format";
import FootballMatchupEvidence from "./FootballMatchupEvidence";
import BriefNotebook from "../basketball/briefs/BriefNotebook";
const tasks = [
  "Confirm the quarterback, offensive line and current availability for both programs.",
  "Review passing efficiency alongside protection and coverage on film.",
  "Check rushing efficiency, stuffed runs and explosive plays against opponent quality.",
  "Inspect the dated forecast record and any qualifying bookmaker observations.",
];
export default function FootballBrief({
  game: g,
  overview: d,
}: {
  game: Game;
  overview: Overview;
}) {
  const p = g.prediction!;
  const favorite = p.home_margin > 0 ? g.home_name : g.away_name;
  const uncertain = p.margin_low <= 0 && p.margin_high >= 0;
  const evidence = getFootballBriefEvidence(g);
  const record = `/research/game/?sport=football&id=${g.id}`;
  return (
    <article className="matchup-brief football-brief">
      <header className="page-title">
        <div className="eyebrow">
          Football / Matchup notebook / Week {g.week}
        </div>
        <h1>
          {g.away_name}
          <br />
          <span className="brief-versus">{g.neutral ? "vs" : "at"}</span>{" "}
          {g.home_name}
        </h1>
        <p>
          The score estimate, the unit production and the questions to take into
          the film room.
        </p>
        <div className="brief-schedule">
          <strong>
            {date(g.kickoff)} ·{" "}
            {g.time_tbd ? "Kickoff time unconfirmed" : kick(g.kickoff)}
          </strong>
          <span>
            {g.venue || "Venue not supplied"} ·{" "}
            {g.neutral ? "Neutral site" : "Source-designated home field"}
          </span>
          <span>
            Template-generated from published evidence · {date(d.generated_at)}{" "}
            forecast edition
          </span>
        </div>
      </header>
      <section
        aria-label="Published model forecast"
        className="brief-scoreboard"
      >
        <div>
          <span>{g.away_name}</span>
          <strong>{fmt(p.away_score)}</strong>
          <small>Projected points</small>
        </div>
        <div className="brief-score-center">
          <span>Model home margin</span>
          <strong>{signed(p.home_margin)}</strong>
          <small>
            {p.home_margin === 0
              ? "Even point estimate"
              : `${favorite} by ${fmt(Math.abs(p.home_margin))}`}
          </small>
          <p>
            {fmt(p.home_win_probability * 100)}% home win estimate ·{" "}
            {fmt(p.total)} total
          </p>
        </div>
        <div>
          <span>{g.home_name}</span>
          <strong>{fmt(p.home_score)}</strong>
          <small>Projected points</small>
        </div>
      </section>
      <div className="brief-forecast-note">
        <p>
          <strong>Read the range.</strong> The nominal 80% home-margin range is{" "}
          {signed(p.margin_low)} to {signed(p.margin_high)} points.{" "}
          {uncertain
            ? "It includes a win by either team."
            : "It falls on one side of zero, but outcomes outside it remain possible."}{" "}
          The range and probability curve were calibrated on{" "}
          {d.model.calibration.season} outcomes.
        </p>
        <p>
          <strong>Know the inputs.</strong> The production model uses team
          identities, prior scores and{" "}
          {g.neutral ? "a neutral-site adjustment" : "home field"}. The unit and
          player statistics below supply context; they do not alter this
          prediction. Transfers, injuries, weather and coaching changes are not
          explicit model features.
        </p>
      </div>
      <FootballMatchupEvidence data={evidence} />
      <section
        className="section football-market"
        aria-labelledby="market-title"
      >
        <div className="section-heading">
          <div>
            <div className="eyebrow">The market checkpoint</div>
            <h2 id="market-title">Check the record before the edge.</h2>
          </div>
          <Link href={record}>Open this game’s forecast history →</Link>
        </div>
        <div className="two-col">
          <div>
            <p>
              The game record keeps registered forecast versions, source-state
              observations and qualifying line comparisons. The prospective
              scorecard selects the earliest eligible registration; that can be
              an older model version than this brief.
            </p>
            <p>
              <Link href="/research/scorecard/">
                Explore the prospective scorecard →
              </Link>
            </p>
          </div>
          <div>
            <p>
              {g.market
                ? `The separate imported archive lists a home spread of ${fmt(g.market.home_spread)} and total of ${fmt(g.market.total)}, observed ${kick(g.market.observed_at)}. Its bookmaker publication time is unavailable. This archive entry cannot establish a pregame price or market edge.`
                : "The separate imported archive has no line for this game. See the dated game record for any qualifying feed observations; an absent quote is not replaced with a guessed price."}
            </p>
            <p>
              A model home margin of +5 and a home spread of −3 differ by +2
              points toward the home side. This describes disagreement, not a
              betting return.
            </p>
          </div>
        </div>
      </section>
      <BriefNotebook
        storageKey={`football-brief:${g.id}:${d.model.id}`}
        tasks={tasks}
      />
      <section className="brief-provenance">
        <h2>How much weight to give this forecast</h2>
        <p>
          The {d.model.version} model was evaluated on{" "}
          {d.model.evaluation.games} games from {d.model.evaluation.season},
          fitted using earlier seasons. Mean absolute margin error was{" "}
          {fmt(d.model.evaluation.margin_mae)} points. These are retrospective
          test results, separate from the prospective record.
        </p>
        <p>
          Model: <code>{d.model.id}</code> · Forecast cutoff: {d.model.cutoff}.
          Schedule and source statistics:{" "}
          <a href="https://github.com/sportsdataverse/sportsdataverse-data">
            SportsDataverse
          </a>
          , CC BY 4.0. Silvermine supplies the independent model, aggregations
          and generated commentary.
        </p>
        <p>
          <Link href="/football/methodology/">Model methodology</Link> ·{" "}
          <Link href="/football/evaluation/">Weekly model experiment</Link> ·{" "}
          <Link href="/football/matchups/">All football matchups</Link>
        </p>
      </section>
    </article>
  );
}
