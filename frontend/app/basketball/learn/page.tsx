import Link from "next/link";

export const metadata = {
  title: "Learn college basketball analytics",
  description:
    "A practical guide to college basketball efficiency, player stats, recruiting evidence and matchup forecasts.",
  alternates: { canonical: "/basketball/learn/" },
};

const metrics = [
  {
    name: "Adjusted offense (Adj O)",
    value: "Points per 100 estimated possessions after opponent and venue adjustment.",
    use: "Higher is better. Compare it with Adj D to see whether a team wins with shot-making, stops or both.",
  },
  {
    name: "Adjusted defense (Adj D)",
    value: "Opponent points per 100 estimated possessions after the same adjustment.",
    use: "Lower is better. A low number is a foundation; the matchup page shows which four factors may explain it.",
  },
  {
    name: "Opponent-adjusted four factors",
    value: "Ridge estimates of eFG%, turnover rate, offensive-rebound rate and free-throw attempt rate after opponent, venue and season-recency adjustment.",
    use: "Read offensive and defensive directions together to find a matchup lever. Missing components stay unavailable; these are independent Silvermine estimates, not KenPom ratings.",
  },
  {
    name: "Strength of schedule (SOS)",
    value: "The mean adjusted net strength of rated opponents, with the number of rated opponents shown beside it.",
    use: "Use SOS to qualify a record’s context, then check the sample count. It describes the opponents faced; it is not a forecast or a replacement for game-level matchup evidence.",
  },
  {
    name: "Tempo",
    value: "Estimated possessions per 40 minutes, including an overtime normalization.",
    use: "Use the pace contrast to ask whether a game will be played in one team’s preferred rhythm.",
  },
  {
    name: "Effective field-goal percentage (eFG%)",
    value: "(FGM + 0.5 × 3PM) ÷ FGA.",
    use: "Three-point makes count for their extra point. It is a cleaner shooting quality measure than raw field-goal percentage.",
  },
  {
    name: "Turnover rate",
    value: "Turnovers divided by estimated possessions for the team, or by player scoring opportunities for an individual.",
    use: "Lower is better. Always check the denominator and sample size before calling a player or team careless.",
  },
  {
    name: "Offensive-rebound rate",
    value: "Offensive rebounds divided by offensive rebounds plus the opponent’s defensive rebounds.",
    use: "It estimates how often a team extends its own possessions. Match it against the opponent’s defensive rebounding.",
  },
  {
    name: "True shooting (TS%)",
    value: "Points ÷ [2 × (FGA + 0.475 × FTA)].",
    use: "A useful scoring-efficiency estimate that includes free throws. The coefficient is disclosed and is not a claim about an official NCAA formula.",
  },
  {
    name: "RAPM",
    value: "Regularized adjusted plus-minus from the attributed NCAA-derived lineup release.",
    use: "Read net, offensive and defensive values with their possession samples. It describes recorded stints, not a guarantee about a future role.",
  },
];

const paths = [
  ["Find a player", "/basketball/players/", "Rates, workload, shooting and game evidence across the archive."],
  ["Compare programs", "/basketball/compare/", "Turn ratings and four factors into a venue-aware matchup question."],
  ["Read the next slate", "/basketball/matchups/", "See every published 2026–27 forecast, interval and model timestamp."],
  ["Study recruiting", "/basketball/recruiting/", "Separate announced additions, roster observations and prior production."],
  ["Open NCAA leaders", "/basketball/ncaa/", "Browse source-native Division I, II and III national leaderboards."],
    ["Inspect player impact", "/basketball/impact/", "Review NCAA-derived RAPM with offensive and defensive samples."],
    ["Read within-team RAPM", "/basketball/impact/within-team/", "Compare source-published player impact relative to teammates across 17 seasons."],
    ["Compare published models", "/basketball/boutique/", "Read attributed team ratings and Box Plus/Minus beside Silvermine's independent model."],
    ["Study lineups", "/basketball/lineups/", "Use possession thresholds and lineup net ratings to ask which combinations actually worked."],
    ["Browse player profiles", "/basketball/player-profiles/", "Start with source identity, position and roster context before reading production or recruiting evidence."],
    ["Search roster intel", "/basketball/ncaa-rosters/", "Use class, position, size, hometown and high-school fields as recruiting context, then verify any transaction with a dated statement."],
    ["Trace high-school pipelines", "/basketball/ncaa-high-schools/", "Aggregate source roster rows by high-school label, then open the underlying players before drawing a recruiting conclusion."],
    ["Rank player production", "/basketball/ncaa-rankings/", "Apply game and minute thresholds before comparing scoring, playmaking or shooting efficiency."],
    ["Compare historical seasons", "/basketball/ncaa-careers/", "Set a season window, keep source identities visible and apply workload thresholds before comparing player production."],
    ["Read shot profiles", "/basketball/ncaa-shooting/", "Compare shot volume, zone conversion and recorded distance within the NCAA source identity namespace."],
];

export default function Page() {
  return (
    <>
      <div className="dateline eyebrow">
        <span>Basketball reading room / Field guide</span>
        <span>Start with the question</span>
      </div>
      <section className="page-title">
        <div className="eyebrow">How to use the desk</div>
        <h1>Learn the game behind the numbers.</h1>
        <p>
          A scoreboard tells you what happened. This guide shows how to move
          from a number to a useful basketball question, then points you to the
          evidence behind the answer.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/basketball/matchups/">
            Read a matchup ↗
          </Link>
          <Link className="hero-link" href="/basketball/model/">
            Open the model notebook →
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">01 / Choose a starting point</div>
            <h2>One desk, six ways in.</h2>
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
            <h2>Translate the stat into a decision.</h2>
          </div>
          <Link href="/basketball/ratings/">See the full ratings table →</Link>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Measure</th>
                <th>What it means</th>
                <th>How to use it</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => (
                <tr key={metric.name}>
                  <th>{metric.name}</th>
                  <td>{metric.value}</td>
                  <td>{metric.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          Silvermine calculations are independent estimates. Publisher metrics
          retain their source labels and source identities. A missing value is
          evidence that the required field or qualifying sample was unavailable.
        </p>
      </section>

      <section className="section two-col">
        <article className="paper-panel">
          <div className="eyebrow">03 / Read a forecast</div>
          <h2>Probability is a starting point.</h2>
          <ol>
            <li>
              <strong>Check the timestamp.</strong> Confirm the model version,
              training cutoff and scheduled start before treating the estimate
              as a pregame view.
            </li>
            <li>
              <strong>Read the margin and interval together.</strong> A narrow
              projected gap can still carry a wide uncertainty band; the range
              describes model error in the held-out calibration sample.
            </li>
            <li>
              <strong>Ask what the model cannot see.</strong> The baseline uses
              historical efficiency and venue. Injuries, eligibility and lineup
              confirmation belong in the staff’s next evidence check.
            </li>
          </ol>
          <p>
            <Link href="/basketball/evaluation/">Review the independent test →</Link>
          </p>
        </article>
        <article className="paper-panel">
          <div className="eyebrow">04 / Read recruiting evidence</div>
          <h2>Keep announcements and production separate.</h2>
          <p>
            A school announcement is evidence that a program published an
            addition or availability update. A prior box-score line describes
            recorded production at a previous program. Neither one alone proves
            eligibility, a current roster spot or a future role.
          </p>
          <p>
            The recruiting board keeps source links, publication dates and later
            availability statements beside the historical statistics. Start
            there, then check the player archive and program dossier.
          </p>
          <p>
            <Link href="/basketball/recruiting/">Open the recruiting file →</Link>
          </p>
        </article>
      </section>

      <section className="section banner">
        <div>
          <div className="eyebrow">Keep studying</div>
          <h3 style={{ marginTop: 12 }}>The journal explains the methods.</h3>
          <p>
            Read the four-factors and impact notes, then open the source and
            coverage pages when you need to audit a number.
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
