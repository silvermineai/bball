import { Suspense } from "react";
import Markets from "./Markets";
import FootballMarketBenchmark from "./FootballMarketBenchmark";
import MarketImportPreflight from "./MarketImportPreflight";
import { getBasketball } from "../../_lib/basketball-data";
import { getLedger } from "../../_lib/research-data";
import type { MarketImportGame } from "../../_lib/market-import";

export const metadata = {
  title: "Historical market archive",
  description:
    "Browse retained college football and basketball market observations with matchup and capture-time context.",
};

export default function Page() {
  const basketball = getBasketball();
  const ledger = getLedger();
  const footballUpcoming: MarketImportGame[] = ledger.games
    .filter((game) => game.sport === "football" && !game.exclusion && !game.time_tbd && (game.status === "scheduled" || game.status === "awaiting_result"))
    .map((game) => ({
      id: game.game_id,
      starts_at: game.starts_at,
      home_name: game.home_name,
      away_name: game.away_name,
      prediction: { home_margin: game.home_margin, total: game.total, home_win_probability: game.home_win_probability },
      fallback_prediction: null,
    }));
  const marketCoverage = (["basketball", "football"] as const).map((sport) => {
    const summary = ledger.sports[sport];
    const games = ledger.games.filter((game) => game.sport === sport);
    return {
      sport,
      registrations: summary.games,
      scheduled: summary.status_counts.scheduled || 0,
      quotedGames: summary.games_with_comparisons,
      quoteRows: games.reduce((total, game) => total + game.comparisons.length, 0),
    };
  });
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
            Each row keeps its capture clock and market context so you can see
            what evidence was available around a matchup.
          </p>
          <a className="hero-link" href="#market-policy">
            Read the evidence policy ↓
          </a>
        </div>
        <div className="ledger-stamp">
          <span className="eyebrow">Use of this archive</span>
          <strong>Reference</strong>
          <p>Historical market observations</p>
          <hr />
          <span>
            Archive retained.
            <br />
            Capture time shown.
            <br />
            Prospective scorecard kept clean.
          </span>
        </div>
      </section>
      <section className="paper-panel" aria-labelledby="market-coverage" style={{ marginBottom: 24 }}>
        <div className="section-heading" style={{ marginBottom: 12 }}>
          <div>
            <div className="eyebrow">Retained evidence / current publication</div>
            <h2 id="market-coverage">Market coverage at a glance</h2>
          </div>
          <span className="note">Exact game and timing checks apply</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Sport</th><th className="numeric">Registered games</th><th className="numeric">Scheduled</th><th className="numeric">Games with quotes</th><th className="numeric">Quote rows</th><th>Status</th></tr></thead>
            <tbody>{marketCoverage.map((row) => <tr key={row.sport}>
              <th scope="row">{row.sport === "basketball" ? "Men’s basketball" : "College football"}</th>
              <td className="numeric">{row.registrations.toLocaleString()}</td>
              <td className="numeric">{row.scheduled.toLocaleString()}</td>
              <td className="numeric">{row.quotedGames.toLocaleString()}</td>
              <td className="numeric">{row.quoteRows.toLocaleString()}</td>
              <td>{row.quotedGames ? "Quote evidence available" : "Awaiting a validated quote"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 12 }}>Counts describe retained research evidence. A missing quote stays missing; it is never inferred from a model estimate or a team name alone. Open the archive below for capture clocks, filters and authorized import.</p>
      </section>
      <Suspense fallback={<p role="status">Loading market archive…</p>}>
        <Markets />
      </Suspense>
      <FootballMarketBenchmark />
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
              prices, feed update clock and observed time. Moneyline rows also show the
              no-vig-style two-sided implied home probability calculated from
              the retained prices. A row can be downloaded from the desk for
              further review.
            </p>
          </div>
          <div className="paper-panel">
            <h3>Why the scorecard is separate</h3>
            <p>
              These records are historical references. The prospective
              forecast scorecard only compares a quote when feed update
              time, capture time, confirmed participants and kickoff all meet
              its selection rules. The archive is therefore useful for
              research without changing the evaluation denominator.
            </p>
          </div>
        </div>
        <div id="csv-import" className="paper-panel" style={{ marginTop: 24 }}>
          <h3>Bring an authorized feed export</h3>
          <p>
            If an approved feed supplies a CSV instead of an API credential,
            the operator can import it through the same exact-match ledger
            path. The importer requires a feed name, license URL, exact
            game ID, UTC start, capture/update clocks, bookmaker and
            both prices. It rejects name-only joins, post-start captures and
            any file containing an invalid row, then stores a file hash with
            the accepted observations.
          </p>
          <p className="note">
            This keeps raw feed access on the server and does not make a
            public copy of a licensed feed.
          </p>
          <div className="button-row">
            <a className="button secondary" href="/data/research/market-import-template.csv" download>Download CSV template ↓</a>
            <a className="hero-link" href="/research/scorecard/?sport=basketball">Open basketball scorecard →</a>
          </div>
          <MarketImportPreflight upcoming={{ basketball: basketball.upcoming, football: footballUpcoming }} />
          <p className="note" style={{ marginTop: 12 }}>
            The archive toolbar supports both the visible page export and a bounded export of every row matching the active sport, season and search filters.
          </p>
        </div>
        <div className="paper-panel" style={{ marginTop: 24 }}>
          <p>
            Read the selection rules in the{" "}
            <a href="/research/scorecard/">forecast record</a>. Market-feed
            details remain in the operator configuration.
          </p>
        </div>
      </section>
    </>
  );
}
