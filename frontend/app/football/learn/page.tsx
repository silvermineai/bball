import Link from "next/link";

export const metadata = {
  title: "Learn college football analytics",
  description:
    "A practical guide to college football player production, efficiency, forecasts and source records.",
  alternates: { canonical: "/football/learn/" },
};

const paths = [
  [
    "Find a player",
    "/football/players/",
    "Start with a season, position group and workload threshold, then compare production within the same source category.",
  ],
  [
    "Read a matchup",
    "/football/matchups/",
    "Open the next slate to see the persisted score, margin, win probability, uncertainty and source clock together.",
  ],
  [
    "Study team efficiency",
    "/football/efficiency/",
    "Compare play-weighted offensive and defensive rates with opponent filters and game-level evidence.",
  ],
  [
    "Audit the source",
    "/football/source-stats/",
    "Search every retained source row, including fields that are not yet mapped into a ranking or model feature.",
  ],
  [
    "Read personnel context",
    "/football/recruiting/",
    "Compare source-listed rosters, recruiting commitments, team talent and returning production before asking a matchup question.",
  ],
];

const concepts = [
  {
    name: "Expected points added (EPA)",
    definition:
      "EPA measures the change in expected scoring value created by a play relative to the game state before it.",
    use:
      "Use total EPA to describe accumulated production and EPA per play to add a workload context. Passing, rushing and receiving are separate categories and should not be added together.",
    href: "/football/players/",
  },
  {
    name: "Success rate",
    definition:
      "The share of recorded plays that produce a positive expected-points change under the source model.",
    use:
      "Pair it with EPA, yards and play count. A high rate on a tiny sample is a lead for review, not a complete player evaluation.",
    href: "/football/players/",
  },
  {
    name: "Yards per play",
    definition:
      "Recorded yards divided by the plays in one source category.",
    use:
      "Use it as a descriptive explosiveness measure. It does not account for field position, down, score state or opponent strength by itself.",
    href: "/football/efficiency/",
  },
  {
    name: "Opponent-adjusted team efficiency",
    definition:
      "Silvermine's ridge model estimates team effects from retained game records while controlling for opponent and venue context.",
    use:
      "Read offensive and defensive rates with the number of games and plays behind them. These ratings describe the archive; the forecast model is a separate artifact.",
    href: "/football/ratings/",
  },
  {
    name: "Forecast margin and probability",
    definition:
      "The current model stores a projected score, home margin, total and calibrated home-win probability for each eligible upcoming game.",
    use:
      "Check the model ID, creation clock and interval before using the estimate. Probability is calibrated on a historical holdout and is not a promise about a future result.",
    href: "/football/methodology/",
  },
  {
    name: "Source coverage",
    definition:
      "Coverage is the set of records a release actually supplies, not an assumption that every roster, snap or statistic exists.",
    use:
      "Inspect source receipts, missing fields and excluded placeholders before drawing a personnel conclusion. Missing data stays missing.",
    href: "/research/coverage/",
  },
];

export default function Page() {
  return (
    <>
      <div className="dateline eyebrow">
        <span>College football reading room / Field guide</span>
        <span>Start with the evidence</span>
      </div>
      <section className="page-title">
        <div className="eyebrow">How to use the football desk</div>
        <h1>
          Learn the game
          <br />
          behind the <em>box score.</em>
        </h1>
        <p>
          A stat becomes useful when its denominator, source and question stay
          attached. This guide moves from raw college football records to a
          matchup preparation workflow without turning a small sample into a
          scouting verdict.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/football/matchups/">
            Read the next slate ↗
          </Link>
          <Link className="hero-link" href="/football/methodology/">
            Open the model notebook →
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">01 / Choose a starting point</div>
            <h2>One desk, several questions.</h2>
          </div>
        </div>
        <div className="article-grid">
          {paths.map(([title, href, description]) => (
            <article className="article-card" key={href}>
              <div className="eyebrow">Research path</div>
              <h2>{title}</h2>
              <p>{description}</p>
              <Link href={href}>Open {title.toLowerCase()} →</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">02 / Metric dictionary</div>
            <h2>Translate the number into a decision.</h2>
          </div>
          <Link href="/football/source-stats/">Inspect raw fields →</Link>
        </div>
        <div className="article-grid">
          {concepts.map((concept) => (
            <article className="article-card" key={concept.name}>
              <div className="eyebrow">Football concept</div>
              <h2>{concept.name}</h2>
              <p>
                <strong>What it is.</strong> {concept.definition}
              </p>
              <p>
                <strong>How to use it.</strong> {concept.use}
              </p>
              <Link href={concept.href}>Open the evidence →</Link>
            </article>
          ))}
        </div>
        <p className="note">
          The football archive preserves publisher fields and source labels.
          A field that is absent from a release is unavailable; it is never
          silently replaced with zero or inferred from a player name.
        </p>
      </section>

      <section className="section two-col">
        <article className="paper-panel">
          <div className="eyebrow">03 / Build a matchup question</div>
          <h2>Read in a repeatable order.</h2>
          <ol>
            <li>
              <strong>Confirm the game.</strong> Check the teams, scheduled
              kickoff, venue and whether the source marks the time as final.
            </li>
            <li>
              <strong>Read the forecast context.</strong> Keep the score,
              margin, probability and interval together with the model ID and
              creation clock.
            </li>
            <li>
              <strong>Find the unit lever.</strong> Use team efficiency and
              player production to choose a passing, rushing, receiving or
              defensive question for film.
            </li>
            <li>
              <strong>Audit the evidence.</strong> Open the source row and
              coverage desk before treating a missing player ID, event record
              or market quote as a conclusion.
            </li>
          </ol>
          <p>
            <Link href="/football/matchups/">Open the matchup desk →</Link>
          </p>
        </article>
        <article className="paper-panel">
          <div className="eyebrow">04 / Keep the model honest</div>
          <h2>Evidence has a boundary.</h2>
          <p>
            The production forecast uses historical team records, venue and
            model calibration. It does not know a late injury, a depth-chart
            change, weather or an eligibility decision unless a future release
            adds and validates that evidence.
          </p>
          <p>
            The player board ranks offensive categories by recorded EPA. The
            defensive and specialist notebook keeps name-attributed events
            separate when the publisher supplies no stable athlete ID.
          </p>
          <p>
            <Link href="/football/evaluation/">Review the holdout results →</Link>
          </p>
        </article>
      </section>

      <section className="section banner">
        <div>
          <div className="eyebrow">05 / Keep studying</div>
          <h3 style={{ marginTop: 12 }}>The journal carries the method into the season.</h3>
          <p>
            Read the forecast and EPA guides, then open the source and coverage
            pages when a number needs a second look.
          </p>
        </div>
        <Link className="button secondary" href="/blog/">
          Read the journal ↗
        </Link>
        <Link className="hero-link" href="/research/coverage/">
          Check source coverage →
        </Link>
      </section>
    </>
  );
}
