import { Suspense } from "react";
import Markets from "./Markets";

export const metadata = {
  title: "Historical market archive",
  description:
    "Browse retained college football and basketball market observations with source, matchup and capture-time context.",
};

export default function Page() {
  return (
    <>
      <div className="dateline eyebrow">
        <span>Research / Market evidence</span>
        <span>Archive desk</span>
      </div>
      <section className="ledger-intro">
        <div>
          <div className="eyebrow">The retained line / football and basketball</div>
          <h1>
            Keep the line
            <br />
            <em>in view.</em>
          </h1>
          <p>
            Search historical market observations held in the research ledger.
            Each row keeps its source and capture context so a coach can see
            what evidence was available around a matchup.
          </p>
          <a className="hero-link" href="#market-policy">
            Read the evidence policy ↓
          </a>
        </div>
        <div className="ledger-stamp">
          <span className="eyebrow">Use of this archive</span>
          <strong>Reference</strong>
          <p>Historical source observations</p>
          <hr />
          <span>
            Source retained.
            <br />
            Capture time shown.
            <br />
            Prospective scorecard kept clean.
          </span>
        </div>
      </section>
      <Suspense fallback={<p role="status">Loading market archive…</p>}>
        <Markets />
      </Suspense>
      <section id="market-policy" className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Evidence protocol</div>
            <h2>Read the clock with the number.</h2>
          </div>
        </div>
        <div className="two-col">
          <div className="paper-panel">
            <h3>What a row contains</h3>
            <p>
              The archive joins a retained market observation to the game
              record: season, teams, scheduled kickoff, line or decimal
              prices, source and observed time. Moneyline rows also show the
              no-vig-style two-sided implied home probability calculated from
              the retained prices. A row can be downloaded from the desk for
              further review.
            </p>
          </div>
          <div className="paper-panel">
            <h3>Why the scorecard is separate</h3>
            <p>
              These records are historical references. The prospective
              forecast scorecard only compares a quote when provider update
              time, capture time, confirmed participants and kickoff all meet
              its selection rules. The archive is therefore useful for
              research without changing the evaluation denominator.
            </p>
          </div>
        </div>
        <div id="csv-import" className="paper-panel" style={{ marginTop: 24 }}>
          <h3>Bring an authorized provider export</h3>
          <p>
            If an approved feed supplies a CSV instead of an API credential,
            the operator can import it through the same exact-match ledger
            path. The importer requires the provider name, license URL, exact
            source game ID, UTC start, capture/update clocks, bookmaker and
            both prices. It rejects name-only joins, post-start captures and
            any file containing an invalid row, then stores a file hash with
            the accepted observations.
          </p>
          <p className="note">
            This keeps raw provider access on the server and does not make a
            public copy of a licensed feed. See the repository&apos;s{" "}
            <a href="https://github.com/silvermineai/bball/blob/main/docs/RESEARCH_LEDGER.md#licensed-csv-imports" target="_blank" rel="noreferrer">CSV import instructions ↗</a>.
          </p>
          <div className="button-row">
            <a className="button secondary" href="/data/research/market-import-template.csv" download>Download CSV template ↓</a>
            <a className="hero-link" href="/research/scorecard/?sport=basketball">Open basketball scorecard →</a>
          </div>
        </div>
        <div className="paper-panel" style={{ marginTop: 24 }}>
          <p>
            Read the selection rules in the{" "}
            <a href="/research/scorecard/">forecast record</a>. Market-feed
            documentation: <a href="https://the-odds-api.com/liveapi/guides/v4/">The Odds API v4</a>.
          </p>
        </div>
      </section>
    </>
  );
}
