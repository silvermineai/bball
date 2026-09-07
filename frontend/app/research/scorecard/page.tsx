import fs from "node:fs";
import path from "node:path";
import { Suspense } from "react";
import Link from "next/link";
import Scorecard from "./Scorecard";
import type { Ledger } from "../../_lib/research-types";
import { date } from "../../_lib/format";
export const metadata = {
  title: "Forecast scorecard and market comparisons",
  description:
    "Follow registered college football and basketball predictions, prospective results, source timestamps and model-versus-market comparisons.",
};
export default function Page() {
  const data: Ledger = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/research/ledger.json"),
      "utf8",
    ),
  );
  return (
    <>
      <div className="dateline eyebrow">
        <span>Research / The public record</span>
        <span>Edition {date(data.generated_at)}</span>
      </div>
      <section className="ledger-intro">
        <div>
          <div className="eyebrow">A prediction needs a memory.</div>
          <h1>
            Put the forecast
            <br />
            <em>on the record.</em>
          </h1>
          <p>
            Follow what the model said before the game, what happened next, and
            how it compares with observed betting lines.
          </p>
          <a className="hero-link" href="#ledger-policy">
            Read the selection rules ↓
          </a>
        </div>
        <div className="ledger-stamp">
          <span className="eyebrow">Registered forecasts</span>
          <strong>
            {Object.values(data.sports)
              .reduce((n, s) => n + s.registered_versions, 0)
              .toLocaleString()}
          </strong>
          <p>Football + men’s basketball</p>
          <hr />
          <span>
            Original estimates retained.
            <br />
            Changed results recorded.
            <br />
            Missing evidence explained.
          </span>
        </div>
      </section>
      <Suspense fallback={<p role="status">Loading the scorecard…</p>}>
        <Scorecard />
      </Suspense>
      <section id="ledger-policy" className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">The protocol / {data.policy}</div>
            <h2>Same games. Honest clocks.</h2>
          </div>
        </div>
        <div className="two-col">
          <div className="paper-panel">
            <h3>How forecasts enter the record</h3>
            <p>
              Each model/game estimate is saved once with its generation time,
              first local registration time, model cutoff and scheduled start.
              Later runs preserve the original estimate. The scorecard chooses
              the first eligible registration per game, before looking at its
              result.
            </p>
            <p>
              A confirmed start is required. A changed start time or participant
              identity excludes that version; a new eligible registration can
              qualify later. Excluded forecasts remain searchable. All games are
              included in their sport’s prospective evaluation, including games
              with no betting line.
            </p>
            <p>
              These results are separate from the retrospective tests in the{" "}
              <Link href="/football/methodology/">football</Link> and{" "}
              <Link href="/basketball/model/">basketball</Link> model notebooks.
            </p>
          </div>
          <div className="paper-panel">
            <h3>How market comparisons qualify</h3>
            <p>
              The quote must be captured after forecast registration and before
              the confirmed start, with a provider update time no later than
              capture. Quotes older than 24 hours when captured are excluded.
              Participant identities and scheduled start must match exactly.
            </p>
            <p>
              We use the last qualifying observation per provider, bookmaker and
              market. It is not a verified closing line. Matched-game errors are
              reported separately for each bookmaker; they are not compared with
              model errors from a different set of games.
            </p>
            <p>
              Home spread difference = projected home margin + home spread.
              Total difference = projected total − observed total. Moneyline
              probabilities remove the two-way overround by normalizing inverse
              decimal prices.
            </p>
          </div>
        </div>
        <div className="paper-panel" style={{ marginTop: 24 }}>
          <h3>Evidence still has limits.</h3>
          {data.limitations.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p>
            Live odds collection uses a separately configured licensed feed. The
            existing SportsDataverse betting archive lacks the timestamps needed
            for this scorecard and is excluded. Zero observed comparisons means
            unavailable evidence, not a zero model edge.
          </p>
          <p>
            Feed documentation:{" "}
            <a href="https://the-odds-api.com/liveapi/guides/v4/">
              The Odds API v4
            </a>{" "}
            ·{" "}
            <a href="https://the-odds-api.com/terms-and-conditions.html">
              Data-use terms
            </a>
            .
          </p>
          <p>
            <Link href="/research/markets/">Browse the historical market archive →</Link>
          </p>
        </div>
      </section>
    </>
  );
}
