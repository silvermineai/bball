import Link from "next/link";
import type { Game, Overview } from "../_lib/data";
import { getFootballBriefEvidence } from "../_lib/football-brief-data";
import { date, fmt, kick, signed } from "../_lib/format";
import FootballMatchupEvidence from "./FootballMatchupEvidence";
import BriefNotebook from "../basketball/briefs/BriefNotebook";
import { footballModelFactors, type FootballModelFactor } from "../_lib/football-model-factors";
import { footballMarketComparison } from "../_lib/football-market-lens";
import LiveFootballBriefMarketTrail from "../football/blog/LiveFootballBriefMarketTrail";
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
  const factors = footballModelFactors(d.model, g);
  const marketComparison = footballMarketComparison({
    homeName: g.home_name,
    homeMargin: p.home_margin,
    homeSpread: g.market?.home_spread,
  });
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
      <section className="section football-model-factors" aria-labelledby="football-model-factors-title">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Model explainability / registered coefficients</div>
            <h2 id="football-model-factors-title">What builds the point estimate?</h2>
          </div>
          <span className="note">{d.model.id}</span>
        </div>
        {factors ? (
          <>
            <p className="note">These additive components reconstruct the published raw margin and total before probability calibration. They are a transparent view of the fitted model, not extra evidence or a second prediction.</p>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Estimate</th><th className="numeric">Intercept</th><th className="numeric">Venue</th><th className="numeric">Home team</th><th className="numeric">Away team</th><th className="numeric">Reconstructed</th></tr></thead>
                <tbody>
                  <ModelFactorRow label="Home margin" factor={factors.margin} />
                  <ModelFactorRow label="Game total" factor={factors.total} />
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="empty">Coefficient-level explanation is unavailable for this forecast edition.</p>}
      </section>
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
            <p>{marketComparison.text}</p>
          </div>
        </div>
      </section>
      <section className="section" aria-labelledby="live-market-title">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Current ledger / exact game</div>
            <h2 id="live-market-title">Refresh the line beside this forecast.</h2>
          </div>
        </div>
        <p className="note">The archived line above is retained for audit and may lack a publication clock. This check resolves the active football model edition first, then shows only exact-game market observations that passed the scorecard's participant and pre-kickoff timing gates.</p>
        <LiveFootballBriefMarketTrail gameId={g.id} />
      </section>
      <p>
        <Link href={`/research/briefs/?sport=football&game=${g.id}`}>
          Retained reading snapshots of this brief →
        </Link>
      </p>
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
          Silvermine supplies the independent model, aggregations and generated
          commentary.
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

function ModelFactorRow({ label, factor }: { label: string; factor: FootballModelFactor }) {
  return <tr>
    <th scope="row">{label}</th>
    <td className="numeric">{signed(factor.intercept)}</td>
    <td className="numeric">{signed(factor.venue)}</td>
    <td className="numeric">{signed(factor.home_team)}</td>
    <td className="numeric">{signed(factor.away_team)}</td>
    <td className="numeric"><strong>{signed(factor.estimate)}</strong></td>
  </tr>;
}
