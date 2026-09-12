import Link from "next/link";
import LiveBasketballJournal from "../../blog/LiveBasketballJournal";
import { getBasketball } from "../../_lib/basketball-data";
import { date } from "../../_lib/format";

export const metadata = {
  title: "Upcoming basketball game notebooks",
  description:
    "Read forecast-backed 2026–27 men’s college basketball game notebooks with Four Factors, uncertainty and source questions.",
  alternates: { canonical: "/basketball/blog/" },
};

export default function Page() {
  const basketball = getBasketball();
  const games = basketball.upcoming
    .filter((game) => game.prediction || game.fallback_prediction)
    .slice(0, 24);
  const nextGame = games[0];
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Basketball notebooks / {date(basketball.generated_at)} edition</div>
        <h1>Prepare for the next game.</h1>
        <p>
          Forecast-backed notebooks turn the 2026–27 slate into a research
          queue: read the range, identify the Four Factors, then take the next
          question to the roster, film and source archives.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/basketball/matchups/">Open the full matchup desk ↗</Link>
          <Link className="hero-link" href="/basketball/forecast-lab/">Compare model editions →</Link>
          <Link className="hero-link" href="/blog/">Read all field guides →</Link>
        </div>
      </div>
      <div className="strip">
        <div><strong>{games.length.toLocaleString()}</strong><span>Notebook previews in this edition</span></div>
        <div><strong>{basketball.coverage.forecast_games.toLocaleString()}</strong><span>Published 2026–27 forecasts</span></div>
        <div><strong>{basketball.model.evaluation.games.toLocaleString()}</strong><span>Held-out games behind the test</span></div>
        <div><strong>{nextGame ? date(nextGame.starts_at) : "—"}</strong><span>Next scheduled source date</span></div>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Live notebook queue</div>
            <h2>Start with the highest-leverage questions.</h2>
          </div>
          <Link href="/basketball/briefs/">Open evidence briefs →</Link>
        </div>
        <p className="note">
          The queue refreshes from the latest retained D1 forecast edition when
          available. Each notebook keeps the model range and source caveats
          attached; a generated preview is a starting point for reporting, not
          a claim about availability or a betting edge.
        </p>
        <LiveBasketballJournal games={games.slice(0, 12)} />
      </section>
      <section className="section two-col">
        <article className="paper-panel">
          <div className="eyebrow">Read the baseline</div>
          <h2>What does the model actually know?</h2>
          <p>Inspect training seasons, calibration, interval coverage and the exact schedule row before carrying a forecast into a staff conversation.</p>
          <Link href="/basketball/model/">Open the model notebook →</Link>
        </article>
        <article className="paper-panel">
          <div className="eyebrow">Keep the evidence open</div>
          <h2>Who could change the matchup?</h2>
          <p>Pair the matchup with NCAA player logs, roster observations, recruiting records and publisher news. Missing evidence stays visible instead of becoming an assumption.</p>
          <div className="button-row"><Link href="/basketball/recruiting/">Recruiting evidence →</Link><Link href="/basketball/ncaa-rankings/">Player rankings →</Link></div>
        </article>
      </section>
    </>
  );
}
