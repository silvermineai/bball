import Link from "next/link";
import FourFactorsCalculator from "./FourFactorsCalculator";
import RecruitingWorkloadCalculator from "./RecruitingWorkloadCalculator";

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
  {
    name: "Publisher Box Plus/Minus (BPM)",
    value: "A source-published player value estimate expressed as points per 100 possessions, with offensive and defensive components when available.",
    use: "Use Box BPM as a second, source-attributed lens on prior player value. It is not a Silvermine forecast, recruiting grade, eligibility ruling or identity crosswalk; missing source rows stay unavailable.",
  },
  {
    name: "ORAPM and DRAPM",
    value: "The offensive and defensive components of the NCAA lineup estimate, each reported in points per 100 possessions.",
    use: "Separate scoring influence from defensive influence, then check the offensive and defensive possession thresholds before comparing players.",
  },
  {
    name: "Points per 40 minutes",
    value: "Recorded points scaled to a 40-minute game: points ÷ minutes × 40.",
    use: "Use it to compare scoring rate across workloads, never as a replacement for total minutes, role or efficiency.",
  },
  {
    name: "Assist-to-turnover ratio",
    value: "Recorded assists divided by recorded turnovers. Zero-turnover rows remain unavailable.",
    use: "Read the ratio with minutes and possession volume. A small turnover denominator can make the rate unstable.",
  },
  {
    name: "Three-point and free-throw attempt rates",
    value: "Three-point attempts or free-throw attempts divided by field-goal attempts, with the source denominator shown by the ranking controls.",
    use: "These describe shot profile and foul pressure. They do not measure accuracy or shooting quality by themselves.",
  },
  {
    name: "Possession share",
    value: "A player’s recorded offensive possessions divided by the recorded player possessions for that NCAA team-season.",
    use: "Use it as a workload context signal. It is not a usage projection and does not establish a future role.",
  },
  {
    name: "Rim attempt rate",
    value: "Recorded rim attempts divided by field-goal attempts in the NCAA player-box release.",
    use: "Use it to see who pressures the paint or who may change a team’s shot profile. Pair it with rim conversion and total attempts.",
  },
  {
    name: "Transition scoring share",
    value: "Recorded transition points divided by total points.",
    use: "Use it to identify players whose scoring depends on pace and live-ball opportunities. It describes source events, not a projected role.",
  },
  {
    name: "Unassisted scoring share",
    value: "Recorded unassisted points divided by total points.",
    use: "Use it as a creation signal alongside usage, efficiency and lineup context. A missing point denominator remains unavailable.",
  },
  {
    name: "Lineup net performance",
    value: "Points scored minus points allowed per 100 shared possessions for a source-native five-v-five lineup pairing.",
    use: "Apply possession and repeat-game thresholds before treating a combination as meaningful. Lineup labels remain in the publisher’s identity namespace.",
  },
  {
    name: "Shot-location profile",
    value: "Recorded field-goal attempts, makes and misses grouped by source event type and validated court coordinates.",
    use: "Start with box-score-matched games, then inspect the location coverage. Coordinates are approximate event evidence, not optical tracking.",
  },
  {
    name: "Roster workload continuity",
    value: "Prior recorded minutes represented by same-program or incoming source-listed players in the next roster snapshot.",
    use: "Use it to frame a recruiting question about experience and workload. It is not a transfer ledger, eligibility ruling or forecast feature.",
  },
];

const paths = [
  ["Find a player", "/basketball/players/", "Rates, workload, shooting and game evidence across the archive."],
  ["Compare programs", "/basketball/compare/", "Turn ratings and four factors into a venue-aware matchup question."],
  ["Read the next slate", "/basketball/matchups/", "See every published 2026–27 forecast, interval and model timestamp."],
  ["Open NCAA leaders", "/basketball/ncaa/", "Browse source-native Division I, II and III national leaderboards."],
  ["Inspect player impact", "/basketball/impact/", "Review NCAA-derived RAPM with offensive and defensive samples."],
  ["Read within-team RAPM", "/basketball/impact/within-team/", "Compare source-published player impact relative to teammates across 17 seasons."],
  ["Study team box history", "/basketball/ncaa-team-box/", "Compare NCAA-derived efficiency, tempo and Four Factor profiles across 17 seasons."],
  ["Compare published models", "/basketball/boutique/", "Read attributed team ratings and Box Plus/Minus beside Silvermine's independent model."],
  ["Study lineups", "/basketball/lineups/", "Use possession thresholds and lineup net ratings to ask which combinations actually worked."],
  ["Rank player production", "/basketball/ncaa-rankings/", "Apply game and minute thresholds before comparing scoring, playmaking or shooting efficiency."],
  ["Compare historical seasons", "/basketball/ncaa-careers/", "Set a season window, keep source identities visible and apply workload thresholds before comparing player production."],
  ["Read shot profiles", "/basketball/ncaa-shooting/", "Compare shot volume, zone conversion and recorded distance within the NCAA source identity namespace."],
];

const recruitingPaths = [
  ["Study recruiting", "/basketball/recruiting/", "Separate announced additions, roster observations and prior production."],
  ["Build a role shortlist", "/basketball/recruiting/fit/", "Choose a program need and rank source-listed candidates by transparent prior-production percentiles."],
  ["Rank roster workload", "/basketball/roster-board/", "Sort source-listed 2026–27 players by prior workload, rates or publisher Box BPM, then open the evidence."],
  ["Browse player profiles", "/basketball/player-profiles/", "Start with source identity, position and roster context before reading production or recruiting evidence."],
  ["Search roster intel", "/basketball/ncaa-rosters/", "Use class, position, size, hometown and high-school fields as recruiting context, then verify any transaction with a dated statement."],
  ["Trace high-school pipelines", "/basketball/ncaa-high-schools/", "Aggregate source roster rows by high-school label, then open the underlying players before drawing a recruiting conclusion."],
  ["Open a player card", "/basketball/ncaa-player/", "Connect source-native production, shot profile, roster context, impact and recent game evidence."],
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
            <h2>One desk, many ways in.</h2>
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
            <div className="eyebrow">02 / Identity and availability</div>
            <h2>Recruiting starts with the source row.</h2>
          </div>
          <Link href="/basketball/recruiting/">Open the recruiting file →</Link>
        </div>
        <div className="article-grid">
          {recruitingPaths.map(([title, href, description]) => (
            <article className="article-card" key={href}>
              <div className="eyebrow">Recruiting path</div>
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
            <div className="eyebrow">03 / Metric dictionary</div>
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

      <section className="section" aria-label="Interactive Four Factors lesson">
        <FourFactorsCalculator />
      </section>

      <section className="section" aria-label="Interactive recruiting workload lesson">
        <RecruitingWorkloadCalculator />
      </section>

      <section className="section two-col">
        <article className="paper-panel">
          <div className="eyebrow">04 / Read a forecast</div>
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
          <div className="eyebrow">05 / Read recruiting evidence</div>
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

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">06 / Build a recruiting brief</div>
            <h2>Move from a name to a defensible question.</h2>
          </div>
          <Link href="/blog/basketball-recruiting-workload/">
            Read the recruiting field guide →
          </Link>
        </div>
        <div className="article-grid">
          <article className="article-card">
            <div className="eyebrow">Step 01 / Find the source row</div>
            <h2>Start with the roster observation.</h2>
            <p>
              Search the source-listed 2026–27 roster and record the season,
              program ID and exact player label. A listed row is an observation,
              not an eligibility ruling.
            </p>
            <Link href="/basketball/roster-board/">Open the roster board →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">Step 02 / Read the announcement</div>
            <h2>Keep the publisher’s date attached.</h2>
            <p>
              Open the school statement and any later availability update. The
              timeline tells you what was reported and when; it does not fill in
              an absent transaction record.
            </p>
            <Link href="/basketball/recruiting/">Open dated evidence →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">Step 03 / Measure prior work</div>
            <h2>Use the complete college sample.</h2>
            <p>
              Check games, minutes, efficiency and the game log at the prior
              program. Keep prep and international additions separate when no
              college box-score profile exists.
            </p>
            <Link href="/basketball/players/">Open the player archive →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">Step 04 / Hand off to the model</div>
            <h2>Ask what still needs confirmation.</h2>
            <p>
              Put the evidence beside the forecast and write the next check:
              availability, role, health, lineup fit or opponent matchup. The
              primary forecast stays reproducible until a reviewed model release
              changes it.
            </p>
            <Link href="/basketball/model/">Read the model boundary →</Link>
          </article>
        </div>
        <p className="note">
          A missing roster observation is not evidence of departure, and prior
          minutes are not a promise of future minutes. Preserve both statements
          when you share a recruiting brief.
        </p>
      </section>

      <section className="section banner">
        <div>
          <div className="eyebrow">07 / Keep studying</div>
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
