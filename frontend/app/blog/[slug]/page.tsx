import Link from "next/link";
import FootballBrief from "../../_components/FootballBrief";
import { notFound } from "next/navigation";
import { getOverview } from "../../_lib/data";
import { getBasketball, getRosters, getRosterModel } from "../../_lib/basketball-data";
import { date, fmt } from "../../_lib/format";
import BasketballNotebook from "../BasketballNotebook";
const titles: Record<string, string> = {
  "reading-the-forecast": "What a preseason model knows. And what it misses.",
  "understanding-player-epa": "Production is a question of context.",
  "market-comparison": "Before measuring an edge, check the clock.",
  "basketball-four-factors": "Read the matchup before you read the score.",
  "basketball-impact": "Read impact with the lineup context intact.",
  "basketball-recruiting-workload":
    "An announcement is a starting point, not a depth chart.",
  "basketball-player-rates":
    "A rate is only as useful as its denominator.",
  "basketball-recruiting-fit":
    "Recruit the role before you recruit the name.",
  "basketball-ranking-playbook":
    "A ranking is a question, not a verdict.",
  "basketball-possession-style":
    "Count the trip before you count the score.",
  "basketball-recruiting-evidence":
    "Build the recruiting brief from the evidence outward.",
  "basketball-availability-evidence":
    "Availability is a source question.",
  "basketball-player-game-logs":
    "Read the game log before you rank the player.",
  "basketball-roster-transitions":
    "Roster continuity is a clue, not a depth chart.",
  "basketball-upcoming-games":
    "Turn the 2026–27 slate into a prep plan.",
};
const descriptions: Record<string, string> = {
  "reading-the-forecast": "How to read a preseason college-sports forecast, its held-out error, uncertainty range and evidence limits.",
  "understanding-player-epa": "How to compare player production with expected points added, meaningful workload thresholds and source context.",
  "market-comparison": "Why model-versus-market comparisons require exact participants, provider clocks and a verified pregame observation.",
  "basketball-four-factors": "A practical guide to Four Factors, pace, forecast ranges and roster evidence for 2026–27 college basketball.",
  "basketball-impact": "How to use ORAPM, DRAPM, net RAPM and possession samples when comparing college basketball players.",
  "basketball-recruiting-workload": "How to connect school statements, roster observations and prior college workload without inventing eligibility or a role.",
  "basketball-player-rates": "How to read NCAA player efficiency and workload rates while keeping denominators, sample size and identity boundaries visible.",
  "basketball-recruiting-fit": "How to use source-listed roster roles, prior workload and transparent fit percentiles to build a defensible recruiting shortlist.",
  "basketball-ranking-playbook": "How to move from NCAA player rankings and impact screens to a reviewable scouting or recruiting question.",
  "basketball-possession-style": "How to read source-recorded possessions, transition share and assisted share as team context without assigning player credit.",
  "basketball-recruiting-evidence": "A practical workflow for connecting NCAA source rows, dated school statements, prior production and the next staff question.",
  "basketball-availability-evidence": "How to read injury, redshirt and tournament-availability signals without turning a headline or roster row into a ruling.",
  "basketball-player-game-logs": "How to use NCAA player-game rows, possession context, denominators and source identity in a recruiting review.",
  "basketball-roster-transitions": "How to evaluate returning workload across dated NCAA roster transitions without turning a source listing into an eligibility claim.",
  "basketball-upcoming-games": "A coach-facing workflow for moving from a 2026–27 forecast range to Four Factors, roster evidence, film questions and a documented market check.",
};
export function generateStaticParams() {
  return [
    ...Object.keys(titles).map((slug) => ({ slug })),
    ...getOverview()
      .upcoming.filter((g) => g.prediction)
      .map((g) => ({ slug: `game-${g.id}` })),
    ...getBasketball()
      .upcoming.filter((g) => g.prediction || g.fallback_prediction)
      .map((g) => ({ slug: `basketball-game-${g.id}` })),
  ];
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const g = getOverview().upcoming.find((g) => `game-${g.id}` === slug);
  const basketballGame = getBasketball().upcoming.find((game) => `basketball-game-${game.id}` === slug);
  const title =
    titles[slug] ||
    (basketballGame
      ? `${basketballGame.away_name} at ${basketballGame.home_name}: 2026–27 basketball notebook`
      : undefined) ||
    (g
      ? `${g.away_name} at ${g.home_name}: 2026 matchup notebook`
      : "Matchup brief");
  return {
    title,
    description: basketballGame
      ? `Projected score, Four Factors and reporting questions for ${basketballGame.away_name} at ${basketballGame.home_name}, ${date(basketballGame.starts_at)}.`
      : g
        ? `Projected score, unit efficiency, historical player production and scouting questions for ${g.away_name} at ${g.home_name}, ${date(g.kickoff)}.`
      : descriptions[slug] || title,
    alternates: { canonical: `/blog/${slug}/` },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params,
    d = getOverview(),
    g = d.upcoming.find((g) => `game-${g.id}` === slug),
    basketball = getBasketball(),
    basketballGame = basketball.upcoming.find((game) => `basketball-game-${game.id}` === slug),
    p = g?.prediction;
  if (!titles[slug] && (!g || !p) && !basketballGame) notFound();
  if (basketballGame) return <BasketballNotebook game={basketballGame} generatedAt={basketball.generated_at} />;
  if (g && p) return <FootballBrief game={g} overview={d} />;
  const canonicalUrl = `https://bball.silvermine.dev/blog/${slug}/`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: titles[slug],
    description: descriptions[slug] || titles[slug],
    datePublished: d.generated_at,
    dateModified: d.generated_at,
    author: { "@type": "Organization", name: "Silvermine Research" },
    publisher: { "@type": "Organization", name: "Silvermine Research", url: "https://bball.silvermine.dev" },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    isAccessibleForFree: true,
    about: { "@type": "Thing", name: "College basketball research" },
  };
  return (
    <article className="article">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <div className="eyebrow">
        Field guide · Silvermine Research · {date(d.generated_at)}
      </div>
      <h1>{titles[slug]}</h1>
      {slug === "reading-the-forecast" ? (
        <>
          <p className="deck">
            The useful question is not simply who will win. It is what evidence
            supports the estimate—and what could make it wrong.
          </p>
          <p>
            Our first football model learns team strength from final scores.
            Each team receives a coefficient; home field adds another effect.
            Ridge regularization keeps a short run of unusual scores from moving
            a coefficient too far. More recent seasons receive greater weight. A
            second regression estimates the combined score.
          </p>
          <h2>A real test requires a boundary</h2>
          <p>
            To evaluate the approach, we trained on{" "}
            {d.model.evaluation.training_seasons.join(", ")} and predicted{" "}
            {d.model.evaluation.season} without feeding any results from that
            season back into the coefficients. Across {d.model.evaluation.games}{" "}
            eligible games, average margin error was{" "}
            {fmt(d.model.evaluation.margin_mae, 2)} points. The simple
            constant-home-margin baseline missed by{" "}
            {fmt(d.model.evaluation.baseline_margin_mae, 2)} points on the same
            games.
          </p>
          <p>
            That improvement is useful evidence for the baseline. It does not
            prove accuracy for every team, and it says nothing about a
            sportsbook advantage. Programs with new quarterbacks or major roster
            turnover can look very different from their historical identity.
          </p>
          <h2>Read the range before the score</h2>
          <p>
            A predicted three-point margin can coexist with a wide range of
            plausible outcomes. Our displayed 80% range uses the 80th percentile
            of absolute forecast errors on {d.model.calibration.season} games. A
            logistic curve fitted on that same earlier window maps projected
            margins to home win probabilities. Neither uses the{" "}
            {d.model.evaluation.season} test results for calibration. The frozen
            range covered {fmt(d.model.evaluation.interval_coverage * 100)}% of
            those test margins. A probability like 60% remains an estimate, not
            a guarantee. The <a href="/football/methodology/">model notebook</a>{" "}
            shows the reliability groups and downloadable test evidence.
          </p>
          <p>
            The next research steps are to incorporate dated roster and
            efficiency features and evaluate on rolling time splits. Use the
            score model to organize film study and identify questions worth
            investigating.
          </p>
        </>
      ) : slug === "understanding-player-epa" ? (
        <>
          <p className="deck">
            A raw yardage total tells you what happened. Expected points added
            asks how much the play changed the scoring outlook.
          </p>
          <p>
            EPA compares the expected scoring value before and after a play,
            accounting for the resulting game state. The football player index
            uses the EPA values published by SportsDataverse. We rank qualified
            FBS players by total EPA within passing, rushing or receiving,
            preserving the publisher’s figures rather than pretending they are
            our own player model.
          </p>
          <h2>Volume and efficiency answer different questions</h2>
          <p>
            Total EPA rewards accumulated contribution. EPA per play helps
            describe efficiency. A player with a handful of successful plays can
            post an eye-catching average, so our ranks require at least 100
            passing plays, 50 rushing plays or 30 receiving plays. These fixed
            thresholds are browsing aids, not a statistical claim that samples
            above them are reliable.
          </p>
          <p>
            Show both columns when comparing players. Ask whether a strong
            average survives meaningful volume, whether the player’s
            opportunities differ, and whether the game log reveals a
            concentrated contribution in one matchup.
          </p>
          <h2>Do not add overlapping credit</h2>
          <p>
            Passing and receiving statistics may describe the same play. Adding
            their EPA can double-count offensive value. Our index keeps the
            categories separate and does not produce an all-position composite
            score. Defensive and specialist box scores remain accessible without
            invented equivalents.
          </p>
          <h2>Production is not recruiting availability</h2>
          <p>
            A 2025 team label describes the program associated with that
            season’s record. It does not confirm a 2026 roster spot, transfer
            status, eligibility, or interest in another program. Recruit
            evaluation requires confirmed roster information and film in
            addition to statistical production.
          </p>
          <p>
            Start with the <Link href="/football/players/">player index</Link>,
            then open a game log to inspect the source records. Missing fields
            are shown as unavailable. Generic source columns retain their
            original names when their meaning has not been established.
          </p>
        </>
      ) : slug === "basketball-four-factors" ? (
        <BasketballFourFactors />
      ) : slug === "basketball-impact" ? (
        <BasketballImpact />
      ) : slug === "basketball-recruiting-workload" ? (
        <BasketballRecruitingWorkload />
      ) : slug === "basketball-player-rates" ? (
        <BasketballPlayerRates />
      ) : slug === "basketball-recruiting-fit" ? (
        <BasketballRecruitingFit />
      ) : slug === "basketball-ranking-playbook" ? (
        <BasketballRankingPlaybook />
      ) : slug === "basketball-possession-style" ? (
        <BasketballPossessionStyle />
      ) : slug === "basketball-recruiting-evidence" ? (
        <BasketballRecruitingEvidence />
      ) : slug === "basketball-availability-evidence" ? (
        <BasketballAvailabilityEvidence />
      ) : slug === "basketball-player-game-logs" ? (
        <BasketballPlayerGameLogs />
      ) : slug === "basketball-roster-transitions" ? (
        <BasketballRosterTransitions />
      ) : slug === "basketball-upcoming-games" ? (
        <BasketballUpcomingGames />
      ) : (
        <>
          <p className="deck">
            A comparison is only as good as its timestamps. A line collected
            after a game cannot establish what a forecaster knew before it.
          </p>
          <p>
            The first import includes {d.coverage.market_observations} archived
            line records. Those records lack a verified bookmaker publication
            timestamp. At this edition, {d.coverage.pregame_market_observations}{" "}
            observations qualify as captured before kickoff. We therefore report
            no prospective market benchmark.
          </p>
          <p>
            The <Link href="/research/scorecard/">forecast scorecard</Link> now
            preserves registered predictions, source-state histories and
            qualifying model-versus-market comparisons for both sports.
          </p>
          <h2>Keep an immutable record</h2>
          <p>
            Each model run receives a version identifier and cutoff. Forecasts
            are stored with their creation time. Imported lines retain their
            observation time and source payload. Later evaluation must select a
            forecast and quote that both existed before kickoff, then join the
            completed result.
          </p>
          <p>
            Closing-line comparisons need a further distinction: the most recent
            quote we happened to collect is not necessarily a sportsbook’s
            closing price. Without publisher time and bookmaker provenance, we
            keep the archive label.
          </p>
          <h2>Check the sign convention</h2>
          <p>
            A home spread of −3 means the home team is favored by three. A model
            home margin of +5 means the model favors the home team by five. The
            difference is +5 + (−3), or two points toward the home team. It
            describes disagreement; it does not by itself account for
            uncertainty, price, or transaction costs.
          </p>
          <h2>Report the misses and the denominator</h2>
          <p>
            A future comparison should state the number of qualifying games,
            excluded observations, pushes, forecast error and probability
            calibration. Games with no line must remain missing. Historical
            performance claims should always identify whether they come from a
            simulation or predictions recorded before the event.
          </p>
        </>
      )}
      <p>
        Data attribution:{" "}
        <a href="https://github.com/sportsdataverse/sportsdataverse-data">
          SportsDataverse
        </a>
        , CC BY 4.0. See the{" "}
        <Link href="/football/methodology/">
          source receipts and model notebook
        </Link>
        .
      </p>
    </article>
  );
}

function BasketballUpcomingGames() {
  const b = getBasketball();
  const games = b.upcoming
    .filter((game) => game.prediction)
    .slice()
    .sort((a, z) =>
      Math.abs(a.prediction!.home_margin) - Math.abs(z.prediction!.home_margin) ||
      a.starts_at.localeCompare(z.starts_at),
    )
    .slice(0, 5);
  const primary = b.coverage.forecast_games;
  const coldStart = b.coverage.baseline_estimate_games || 0;
  return (
    <>
      <p className="deck">
        A forecast is a reading order. The staff work starts when you turn that
        estimate into a matchup question that can be checked against the
        schedule, personnel and film.
      </p>
      <p>
        The current release covers {b.coverage.upcoming_games.toLocaleString()} upcoming
        games: {primary.toLocaleString()} primary efficiency forecasts and{" "}
        {coldStart.toLocaleString()} separately labeled cold-start estimates. Open the{" "}
        <Link href="/basketball/matchups/">matchup desk</Link> to see the
        projected score, pace, win probability and calibrated margin range.
      </p>
      <h2>Start with the range</h2>
      <p>
        Read the interval before deciding how much confidence to place in the
        point estimate. A close projected margin with a wide range is a cue to
        identify swing possessions and lineup questions. A large margin with a
        narrower range still needs opponent and venue context. The{" "}
        <Link href="/basketball/model/">model notebook</Link> shows the
        temporal holdouts, calibration and source boundary behind those values.
      </p>
      <h2>Use Four Factors to choose film</h2>
      <p>
        Move from the score to effective field goal percentage, turnover rate,
        offensive rebounding and free-throw rate. A factor edge is a prompt to
        inspect how a team creates it: shot quality, pressure, second chances
        or rim pressure. The{" "}
        <Link href="/basketball/compare/">matchup workbench</Link> keeps the
        two teams, venue scenario and historical context together while you
        write the next film question.
      </p>
      <h2>Let roster evidence change the question</h2>
      <p>
        The <Link href="/basketball/roster-lab/">roster lab</Link> and{" "}
        <Link href="/basketball/recruiting/fit/">role-fit board</Link> show
        source-listed workload, prior production and the evidence gaps around
        a program. Use those rows to ask who must absorb minutes or defend a
        different role. A roster listing does not establish eligibility,
        availability or a future rotation, so keep the primary forecast and
        the roster scenario labeled separately.
      </p>
      <h2>Document the market clock</h2>
      <p>
        If a licensed pregame quote is available, compare its timestamp,
        bookmaker and matched participants in the{" "}
        <Link href="/research/markets/">market archive</Link>. If it is not,
        record a browser-only line note and leave the evidence unavailable. A
        later quote cannot be relabeled as a closing line, and a model gap is
        not a betting result without a settled game and a complete denominator.
      </p>
      <h2>Five games to open first</h2>
      <p>
        These are the closest primary margins in the current edition. They are
        a transparent review order, not a new confidence model.
      </p>
      <div className="article-grid">
        {games.map((game) => {
          const prediction = game.prediction!;
          return (
            <article className="article-card" key={game.id}>
              <div className="eyebrow">{date(game.starts_at)} · {game.venue || "Venue pending"}</div>
              <h3>{game.away_name} at {game.home_name}</h3>
              <p>
                Home margin {prediction.home_margin >= 0 ? "+" : ""}{prediction.home_margin.toFixed(1)} · range {prediction.margin_low.toFixed(1)} to {prediction.margin_high.toFixed(1)} · home win {Math.round(prediction.home_win_probability * 100)}%.
              </p>
              <Link href={"/basketball/briefs/" + game.id + "/"}>Open the evidence brief →</Link>
            </article>
          );
        })}
      </div>
      <p>
        Finish the one-pager with the source edition, the biggest factor edge,
        one personnel assumption, one film clip to verify and the result that
        would change the plan. That makes the preview useful even when the
        final score disagrees with the estimate.
      </p>
    </>
  );
}

function BasketballPlayerGameLogs() {
  const b = getBasketball();
  return (
    <>
      <p className="deck">
        A season average is a summary. A game log shows the workload, opponent
        context and missingness that make the summary worth trusting.
      </p>
      <p>
        The <Link href="/basketball/ncaa-player-box/">NCAA player box archive</Link>{" "}
        keeps game-level releases from 2010–11 through 2025–26, with source
        player, team and contest IDs beside every usable row. The 2010–11
        edition is a sparse historical source release and is labeled as such
        in the archive. The archive also retains older player-season summaries.
        It is a source
        record, not an identity bridge to ESPN, and a row does not establish a
        current roster spot or eligibility.
      </p>
      <h2>Start with minutes and games</h2>
      <p>
        Points per game can rise because a player received more possessions,
        played longer rotations or faced a particular schedule. Read minutes,
        games and starts when the source reports them, then open the individual
        dates. A strong rate across four appearances is a different scouting
        lead from the same rate across thirty games. The rankings board lets
        you set minimum games, minutes and denominator-specific volume before
        sorting.
      </p>
      <h2>Use the denominator that created the rate</h2>
      <p>
        True shooting uses field-goal and free-throw attempts. Effective
        field-goal percentage gives a made three its extra value. Turnover rate
        uses recorded offensive possessions, while three-point and free-throw
        accuracy use their own attempt totals. A missing denominator remains
        unavailable; it is never silently converted to zero. Open the retained
        source fields on a row when a rate needs explanation.
      </p>
      <p>
        The source also records possession, transition and assisted/unassisted
        splits. Those fields describe what the publisher captured for that
        player-game row. They are useful context for workload and role, but
        they do not isolate scheme, matchup quality or player credit without
        lineup and film evidence.
      </p>
      <h2>Check the archive audit</h2>
      <p>
        Each game-level season reports missing IDs or matchup labels, date
        problems, impossible made/attempt totals, negative possessions,
        out-of-range minutes and zero-minute rows that carry production. The
        NCAA release does not include venue or home/away fields, so location
        questions belong to the schedule and team-box archives. This separation
        keeps a player row from pretending to contain context it never carried.
      </p>
      <h2>Connect production to recruiting carefully</h2>
      <p>
        A game log can verify prior workload for a source ID. It cannot prove
        that an announcement is a transfer, that a roster listing means
        availability or that the same player will receive the same role. Pair
        the log with the dated{" "}
        <Link href="/basketball/recruiting/">recruiting evidence board</Link>,{" "}
        the <Link href="/basketball/ncaa-rosters/">NCAA roster archive</Link>
        and the program&apos;s film questions. If those layers disagree, keep
        the disagreement visible for staff review.
      </p>
      <p>
        The current Silvermine model forecasts{" "}
        {b.coverage.forecast_games.toLocaleString()} 2026–27 games from team
        efficiency and pace. Player logs and recruiting evidence help a coach
        decide what to investigate; they are not silently inserted into that
        primary forecast.
      </p>
    </>
  );
}

function BasketballRosterTransitions() {
  const b = getBasketball();
  const model = getRosterModel();
  const historical = model.historical_evaluation;
  return (
    <>
      <p className="deck">
        A roster release can show who was listed. It cannot tell a coach who is
        eligible, healthy or ready for the same role. Continuity becomes useful
        when its date, source identity and denominator stay visible.
      </p>
      <p>
        The <Link href="/basketball/roster-lab/">roster lab</Link> compares
        exact source-athlete IDs across consecutive releases. Returning minutes
        are separated from represented prior minutes, which also includes an
        exact ID seen at a different program. Unrepresented minutes remain a
        review queue; they are never labeled as departures.
      </p>
      <h2>Start with the transition clock</h2>
      <p>
        A transition row is a relationship between two source editions, not a
        live transaction. The current production challenger fits prior net
        efficiency, listed workload and attributed publisher Box BPM, then
        produces a margin scenario for the 2026–27 slate. It does not alter the
        primary probability, uncertainty or ledger registration.
      </p>
      {historical ? (
        <>
          <h2>Read the historical replay honestly</h2>
          <p>
            A separate NCAA-source replay adds dated workload evidence. It uses
            the {historical.transition_rows["2024"]?.toLocaleString() ?? "—"}, {historical.transition_rows["2025"]?.toLocaleString() ?? "—"} and {historical.transition_rows["2026"]?.toLocaleString() ?? "—"} mapped transition rows and keeps Box BPM out because that source release does not carry the publisher identity. The model is evaluated on the following season after fitting only earlier transitions.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Test season</th><th>Training seasons</th><th className="numeric">Teams</th><th className="numeric">Workload MAE</th><th className="numeric">Prior-net MAE</th></tr></thead>
              <tbody>
                {historical.transition_evaluations.map((transition) => (
                  <tr key={transition.test_season}>
                    <td>{transition.test_season}</td>
                    <td>{transition.training_seasons.join(", ")}</td>
                    <td className="numeric">{transition.rows.teams.toLocaleString()}</td>
                    <td className="numeric">{fmt(transition.rows.mae, 2)}</td>
                    <td className="numeric">{fmt(transition.rows.baseline_mae, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            These retrospective results are evidence about this workload
            replay, not a promise of future accuracy or a betting edge. The
            source mapping excludes ambiguous team names, and a source listing
            still does not establish eligibility, availability, injury status
            or depth-chart role.
          </p>
        </>
      ) : null}
      <h2>Turn a row into a staff question</h2>
      <p>
        If represented minutes are low, ask which role needs replacing and what
        evidence supports that conclusion. If represented minutes are high, ask
        whether the returning player’s prior shot profile and defensive work
        fit the new opponent. Open the <Link href="/basketball/ncaa-player-box/">game log</Link>,
        <Link href="/basketball/ncaa-rosters/"> NCAA roster record</Link> and
        <Link href="/basketball/recruiting/"> dated announcement</Link> together.
        When the sources disagree, preserve the disagreement for film and
        eligibility review.
      </p>
      <p>
        The primary forecast currently covers {b.coverage.forecast_games.toLocaleString()} 2026–27 games from team efficiency and pace. Roster evidence tells a coach where to investigate; it does not silently become a model input.
      </p>
    </>
  );
}

function BasketballRecruitingFit() {
  const b = getBasketball();
  const rosters = getRosters();
  return (
    <>
      <p className="deck">
        A recruiting board should answer a role question before it ranks a
        player. Start with the source-listed roster, identify the workload that
        is already represented, and then compare candidates against a clear
        priority.
      </p>
      <p>
        The <Link href="/basketball/recruiting/fit/">recruiting fit board</Link>{" "}
        uses the {rosters.players.length.toLocaleString()} source-listed player
        rows in the current 2026–27 roster release. It groups source position
        labels into guard, wing and big roles, then lets you choose creation,
        shooting, rebounding, defensive events or workload as the priority.
      </p>
      <h2>Start with the role room</h2>
      <p>
        The selected program’s role cards show listed players and the prior
        minutes attached to exact source IDs. Returning and incoming minutes
        stay separate, and minutes attached to ambiguous source rows remain in
        an explicit unclassified bucket. They describe what the release
        represents; they do not prove that a player left, transferred, is
        eligible or will play the same role next season.
      </p>
      <h2>Read the fit score as a sorting aid</h2>
      <p>
        Candidates are filtered outside the selected program and require a
        prior production record plus the chosen minimum workload. The board
        combines a 70% percentile for the selected skill priority with a 30%
        percentile for prior minutes. Creation blends assists and points;
        shooting blends true shooting and effective field goal percentage;
        defense blends steals and blocks. Missing source fields remain missing
        rather than receiving a guessed value.
      </p>
      <p>
        Percentiles make the units comparable, but they do not make the score a
        fitted transfer model. A high workload can reflect a different role,
        and a strong shooting percentile can come from a small sample. Open the
        source roster, the prior game log and the dated announcement before
        making a recruiting conclusion.
      </p>
      <h2>Keep the evidence boundary visible</h2>
      <p>
        The recruiting file currently contains selected school announcements,
        while the roster release provides the broader source frame. The fit
        board joins those layers only through exact source IDs when a player
        link exists. It does not infer a portal transaction from a different
        program label or turn a roster observation into an availability claim.
      </p>
      <p>
        Once a shortlist is built, use the{" "}
        <Link href="/basketball/player-profiles/">player profile browser</Link>,{" "}
        <Link href="/basketball/recruiting/">dated recruiting file</Link> and{" "}
        <Link href="/basketball/programs/">program dossier</Link> together.
        The model forecasts {b.coverage.forecast_games.toLocaleString()} games
        for 2026–27, but recruiting evidence remains a staff verification layer
        outside the primary forecast.
      </p>
    </>
  );
}

function BasketballRecruitingWorkload() {
  const b = getBasketball();
  return (
    <>
      <p className="deck">
        Recruiting research becomes useful when every statement keeps its own
        date, source and level of certainty. Start with what a school said,
        then add the historical production that can be verified.
      </p>
      <p>
        An announcement confirms that a publisher reported an addition. It does
        not settle eligibility, a roster spot, health or the minutes a player
        will receive. The{" "}
        <Link href="/basketball/recruiting/">recruiting evidence board</Link>{" "}
        keeps the original source beside later redshirt or availability
        statements so a newer update does not erase the earlier record.
      </p>
      <h2>Three records answer three questions</h2>
      <p>
        School announcements answer what was publicly reported and when. The
        roster observation view answers which source-listed player and program
        affiliations appeared in a particular release. The player archive
        answers what happened in recorded college games. A missing observation
        is not a departure, and a prior team label is not a transfer explanation.
      </p>
      <p>
        Those distinctions matter in the current file: {b.ratings.length}{" "}
        programs have model ratings, while recruiting coverage is a selected
        review rather than a national census. The{" "}
        <Link href="/basketball/programs/">program dossiers</Link> show
        historical workloads beside the source-listed roster view without
        feeding an unconfirmed listing into the forecast.
      </p>
      <h2>Read workload as represented evidence</h2>
      <p>
        Prior points and minutes describe the player’s previous sample. They do
        not add together into a guaranteed new-school rotation. A sum of prior
        MPG on the recruiting board means that much workload is represented by
        linked profiles in the reviewed file; it does not mean those players
        will share the same role or remain available.
      </p>
      <p>
        Use the{" "}
        <Link href="/basketball/scouting-board/">scouting board</Link> to
        compare complete historical records, then open the source statement and
        check the date. Keep prep and international additions separate when no
        college box-score profile exists. This produces a more honest briefing
        than filling gaps with a recruiting grade or an inferred departure.
      </p>
      <h2>Keep the forecast boundary visible</h2>
      <p>
        The 2026–27 model is a historical efficiency baseline. Its published
        forecast and retrospective evaluation remain unchanged by recruiting
        announcements, and a scenario in the game-plan workbench is a coaching
        question rather than a registered prediction. When a later source
        changes availability, update the evidence trail first; only a reviewed
        model release should change the forecast.
      </p>
      <p>
        Read the{" "}
        <Link href="/basketball/model/">model notebook</Link> for the exact
        training cutoff, source editions and known limitations. Good recruiting
        analysis does not hide uncertainty—it gives the staff a clear next
        verification step.
      </p>
    </>
  );
}

function BasketballFourFactors() {
  const b = getBasketball();
  return (
    <>
      <p className="deck">
        A college basketball forecast is more useful when it tells you which
        possessions deserve attention. Start with shooting, turnovers,
        rebounding and free throws, then use pace and roster evidence to plan
        the questions you will ask in film.
      </p>
      <p>
        Silvermine rates {b.ratings.length} programs from paired 2025–26 box
        scores and publishes {b.coverage.forecast_games.toLocaleString()}{" "}
        2026–27 forecasts in this edition. The model estimates efficiency and
        tempo from historical team performance. It does not copy a proprietary
        KenPom rating or claim to know a player&apos;s current health or role.
      </p>
      <h2>Four questions for every possession</h2>
      <p>
        Effective field-goal percentage gives made threes their extra value; a
        team that creates efficient shots can survive an ordinary free-throw
        night. Turnovers per possession measure how often an offense gives the
        ball away before it can create a shot. Offensive rebounding rate asks
        whether a missed shot becomes another possession. Free-throw rate
        describes pressure at the rim and the value of getting to the line.
      </p>
      <p>
        Read offense and defense together. A high offensive rebounding rate can
        be muted by an opponent that ends possessions with defensive rebounds. A
        low turnover rate matters less if the team cannot generate efficient
        attempts. Each program dossier shows the numerator, denominator and
        number of games behind the displayed split.
      </p>
      <h2>Translate the forecast into a plan</h2>
      <p>
        The published 80% margin range is a reminder that the score is a
        distribution, not a promise. Open the{" "}
        <Link href="/basketball/gameplan/">game-plan workbench</Link>, choose
        the floor, and compare the matchup factors. The roster panel places
        source-listed 2026–27 movement beside the historical rotation. A
        returning-player match or different-program observation is a question
        for staff review, not proof of availability or a new model input.
      </p>
      <h2>What the model has not seen</h2>
      <p>
        A box-score model cannot identify an injury announced after its cutoff,
        a changed role, a redshirt decision or a late transfer unless a later
        source edition records it. The recruiting board preserves dated school
        statements and prior production with explicit coverage limits. It does
        not turn a signing into an eligibility ruling. Keep those facts beside
        the forecast and report uncertainty when you write the preview.
      </p>
      <p>
        For the formulas, independent holdout and source receipts, read the{" "}
        <Link href="/basketball/model/">basketball model notebook</Link>. For
        the player-level archive, use the{" "}
        <Link href="/basketball/scouting-board/">scouting board</Link> to set
        your own production priorities and export the evidence behind a rank.
      </p>
    </>
  );
}

function BasketballPlayerRates() {
  return (
    <>
      <p className="deck">
        A leaderboard can answer who led a category. A coaching decision also
        needs to answer how often the player was involved and how much evidence
        sits behind the rate.
      </p>
      <p>
        The <Link href="/basketball/ncaa-rankings/">NCAA player rankings</Link>
        keep the source player and team IDs visible while offering counting
        totals, shooting rates, assist-to-turnover ratio, defensive events,
        RAPM components and recorded possession share. These are descriptive
        source statistics. They do not establish a current roster spot,
        eligibility, health or a projected role.
      </p>
      <h2>Start with the denominator</h2>
      <p>
        True shooting and effective field goal percentage use field-goal and
        free-throw attempts. Three-point attempt rate uses field-goal attempts.
        Turnover rate uses recorded offensive possessions, while assist-to-
        turnover ratio uses recorded turnovers. The ranking board lets you set
        a minimum rate sample using the matching denominator so a player with a
        short run of attempts does not look like a full-season shooting leader.
      </p>
      <h2>Separate workload from efficiency</h2>
      <p>
        Team possession share describes the player&apos;s recorded offensive
        possessions divided by all recorded player possessions for that
        team-season. It is a workload context measure, not a proprietary usage
        estimate. Pair it with minutes, games and points per 40 rather than
        treating a high share as proof of decision-making quality.
      </p>
      <h2>Split the rebound and contact story</h2>
      <p>
        The historical player archive also reports offensive rebounds per game,
        defensive rebounds per game and personal fouls per game. ORB/G helps
        describe second-chance creation, while DRB/G describes defensive glass
        work; both are recorded per-game rates and should be read with minutes
        and team context. PF/G is a contact signal, not a discipline grade.
        Missing source fields remain unavailable rather than becoming zeroes.
        Use the <Link href="/basketball/players/">player archive</Link> and{" "}
        <Link href="/basketball/roster-board/">roster board</Link> to sort these
        rates and carry the source sample into a recruiting review.
      </p>
      <h2>Keep impact in its own lane</h2>
      <p>
        ORAPM and DRAPM come from a separate NCAA lineup-impact release. The
        board requires exact NCAA player IDs and shows offensive and defensive
        possession samples. A player can be efficient in the box score and
        unavailable in RAPM, or the reverse, because the releases measure
        different things. Missing impact is not zero impact.
      </p>
      <h2>Use the ranking to choose the next question</h2>
      <p>
        Open the source player card, inspect the season and game evidence, then
        compare the result with the{" "}
        <Link href="/basketball/scouting-board/">historical scouting board</Link>{" "}
        and dated{" "}
        <Link href="/basketball/recruiting/">recruiting evidence</Link>. A
        strong rate should direct film review and source verification; it
        should not silently become a recruiting grade or a forecast feature.
      </p>
    </>
  );
}

function BasketballImpact() {
  return (
    <>
      <p className="deck">
        A player’s box score records what happened while they were on the
        floor. Adjusted plus-minus asks a harder question: how did the team’s
        scoring balance change after accounting for the teammates and opponents
        in those lineups?
      </p>
      <p>
        The <Link href="/basketball/impact/">impact board</Link> publishes
        NCAA-derived regularized adjusted plus-minus (RAPM) from the attributed
        SportsDataverse release. ORAPM describes the offensive component,
        DRAPM the defensive component, and net RAPM is their sum. The publisher
        fits a ridge model across Division I stints, which helps keep a player
        with a small or highly unusual lineup sample from dominating the fit.
      </p>
      <h2>Start with the possession denominator</h2>
      <p>
        A large positive estimate with 2,000 possessions has a different level
        of evidence than the same estimate with 250. The board’s qualified
        view requires at least 500 offensive and 500 defensive possessions. That
        threshold is a browsing rule, not a guarantee that the estimate is
        stable. Use the possession columns to keep the sample visible when you
        sort by ORAPM, DRAPM or net RAPM.
      </p>
      <h2>Keep offense and defense separate</h2>
      <p>
        Net RAPM is useful for a first pass, but it can hide a player’s role. A
        strong ORAPM with a neutral DRAPM suggests a different film question
        than a defensive specialist with the reverse profile. Sort each
        component, then compare the result with the{" "}
        <Link href="/basketball/players/">box-score archive</Link> for minutes,
        shooting, rebounding and turnovers. These measures answer related
        questions and should not be added into a new composite without a
        separate validated model.
      </p>
      <h2>Do not turn a historical estimate into a roster claim</h2>
      <p>
        RAPM describes recorded stints in a source season. It does not establish
        a player’s current team, health, eligibility or expected role next
        season. NCAA source IDs remain in their own identity namespace; they are
        not joined to ESPN identities by name alone. For 2026–27 preparation,
        put the estimate beside the dated{" "}
        <Link href="/basketball/recruiting/">recruiting evidence</Link> and
        current roster observations, then confirm availability with the school.
      </p>
      <h2>Use it to choose film, not to skip film</h2>
      <p>
        A useful workflow is to identify a player whose component estimate
        changes the matchup, inspect the possession sample, and then write a
        question for film. Does the offensive value come from creation, shot
        selection or finishing? Does the defensive value survive different
        matchups? The{" "}
        <Link href="/basketball/gameplan/">game-plan workbench</Link> turns those
        questions into matchup preparation while keeping the forecast model’s
        roster limitations explicit.
      </p>
    </>
  );
}

function BasketballRankingPlaybook() {
  const b = getBasketball();
  return (
    <>
      <p className="deck">
        The best player board does not tell a coach whom to recruit. It makes
        the evidence behind a shortlist easy to inspect, compare and challenge.
      </p>
      <p>
        The <Link href="/basketball/ncaa-rankings/">NCAA rankings board</Link>
        offers {b.coverage.player_box_rows.toLocaleString()} source-linked player
        rows across counting stats, rates, possession context and lineup
        impact. Every row keeps its NCAA player and team IDs, season, games and
        minutes visible. Those fields establish what the release recorded; they
        do not establish a current roster spot, eligibility or a future role.
      </p>
      <h2>Choose the question before the metric</h2>
      <p>
        Use points per game or points per 40 when the question is scoring
        volume, then check minutes and games. Use true shooting or effective
        field-goal percentage to study shot efficiency, and read the matching
        attempt denominator beside the rate. Assist-to-turnover ratio, turnover
        rate and team possession share describe ball security and involvement;
        they are not interchangeable definitions of creation. Rebounding and
        stocks per 40 can surface a role, but they still need lineup and
        matchup context.
      </p>
      <h2>Use the two composite views as screens</h2>
      <p>
        The balanced production index standardizes eight available components—
        points, rebounds, assists, steals, blocks, true shooting, effective
        field goal percentage and points per 40—within the filtered board and
        averages the components that meet their denominators. At least four
        components are required. It is useful for finding broadly productive
        players, while its component audit shows what is missing.
      </p>
      <p>
        The impact + production index requires an exact-ID net RAPM record and
        points per 40. RAPM must include at least 500 offensive and 500
        defensive possessions. That makes the screen narrower and more useful
        for a lineup question, but a missing RAPM row is missing evidence, not
        zero value. Open the{" "}
        <Link href="/basketball/impact/">impact board</Link> to inspect the
        possession sample before drawing a conclusion.
      </p>
      <h2>Turn a rank into a recruiting workflow</h2>
      <p>
        Start with a role: secondary creator, spacing wing, defensive rebounder
        or point-of-attack defender. Filter the ranking to a meaningful sample,
        open the{" "}
        <Link href="/basketball/ncaa-player/">source player card</Link>, and
        inspect the game-level record. Then search the{" "}
        <Link href="/basketball/recruiting/">dated recruiting file</Link> and{" "}
        <Link href="/basketball/recruiting/fit/">fit board</Link>. A school
        announcement can confirm what was published and when; it cannot by
        itself confirm availability, eligibility or the minutes a player will
        receive.
      </p>
      <h2>Keep the denominator in the report</h2>
      <p>
        A shortlist should name the season, source release, sample thresholds,
        metric and missing fields alongside each player. Compare similar roles
        and competition where possible. If a player ranks highly on a rate but
        has a small attempt or possession sample, write that limitation into
        the scouting note. The{" "}
        <Link href="/basketball/model/">model notebook</Link> keeps these
        descriptive rankings separate from the 2026–27 matchup forecast, so a
        leaderboard never silently becomes a prediction input.
      </p>
    </>
  );
}

function BasketballPossessionStyle() {
  const b = getBasketball();
  const layer = b.coverage.datasets?.find((dataset) => dataset.key === "ncaa_possessions");
  return (
    <>
      <p className="deck">
        A team’s pace and efficiency describe the result of its possessions. A
        possession-style profile adds a little more context: how many trips the
        source recorded, how often those trips were tagged transition or
        assisted, and how much of the sample was marked garbage time.
      </p>
      <p>
        The <Link href="/basketball/possession-style/">possession-style archive</Link>{" "}
        contains {layer?.rows.toLocaleString() || "2,836"} team-season profiles
        across the 2019–26 NCAA source editions. The underlying releases contain
        millions of possession rows; Silvermine aggregates them by team and
        season while retaining the source receipt and team identity.
      </p>
      <h2>Read the five useful columns</h2>
      <p>
        Points per possession is recorded points divided by recorded trips.
        Possessions per game describes the source pace of the sample. Transition
        share and assisted share are the publisher’s binary possession flags;
        garbage-time share tells you how much of the sample carries that tag.
        These are context measures, so compare them with the same season and
        keep the total possession count visible.
      </p>
      <h2>Do not turn team context into player credit</h2>
      <p>
        A possession row belongs to a team in this archive. It does not say
        which player created, assisted or defended the trip, and lineup
        membership is not used to invent that attribution. Use the separate{" "}
        <Link href="/basketball/ncaa-player-box/">NCAA player box archive</Link>{" "}
        and <Link href="/basketball/lineups/">lineup lab</Link> when the question
        is about personnel.
      </p>
      <h2>Use style to choose the next question</h2>
      <p>
        In a matchup, a large pace contrast can frame a transition-defense
        question, while a large assisted-share gap can point toward ball
        pressure and help rotations. Those are film prompts, not causal claims
        or new forecast features. The <Link href="/basketball/compare/">matchup
        workbench</Link> places the profile beside the published model and
        Four Factors so the numbers stay connected to a concrete preparation
        question.
      </p>
    </>
  );
}

function BasketballRecruitingEvidence() {
  return (
    <>
      <p className="deck">
        A recruiting board is most useful when every claim has a source, a
        date and a clear boundary. Start with what a publisher actually
        recorded, then decide what still needs a coach&apos;s confirmation.
      </p>
      <p>
        The <Link href="/basketball/recruiting/">recruiting file</Link> keeps
        school announcements, later availability statements and source-listed
        roster observations in separate layers. The{" "}
        <Link href="/basketball/ncaa-player/">NCAA player card</Link> keeps
        season production, shooting, roster fields and impact in the NCAA
        source-ID namespace. Those layers can inform one another without
        turning a name match into a verified transfer or eligibility record.
      </p>
      <h2>Begin with the exact source row</h2>
      <p>
        Record the player label, source ID, season, program ID and publisher
        URL before interpreting a number. A roster row is an observation of a
        release. It is not proof that the player is currently eligible,
        enrolled, healthy or available for the next game. A missing row is
        equally limited: it does not prove departure.
      </p>
      <p>
        NCAA rows and ESPN-derived rows use different identity systems. The
        site keeps them separate and links between them as search handoffs when
        useful. Do not merge two people because their names look similar, and
        do not treat a shared school label as a crosswalk.
      </p>
      <h2>Put production beside the announcement</h2>
      <p>
        Prior minutes and rates describe recorded college work. Use games and
        minutes to qualify a rate, then inspect the denominator: true shooting
        needs field-goal and free-throw attempts, while three-point accuracy
        needs three-point attempts. A blank value means the source did not
        provide the required field or sample; it is not a zero.
      </p>
      <p>
        For a broader screen, the{" "}
        <Link href="/basketball/recruiting/fit/">role-fit board</Link> ranks
        source-listed candidates by transparent prior-production percentiles.
        Treat the result as a review order. It does not predict a new-school
        role, establish a commitment or replace film.
      </p>
      <h2>Keep the dates in the timeline</h2>
      <p>
        A school announcement and a later availability statement answer
        different questions. Keep both events, with their publisher and
        publication date, so a later statement updates the timeline without
        erasing the original report. The official{" "}
        <a href="https://www.ncaa.org/eligibility-center/transfer-rules-and-eligibility/" target="_blank" rel="noreferrer">NCAA transfer rules</a>
        {" "}remain the reference for eligibility; a school post or roster
        listing cannot substitute for an official ruling.
      </p>
      <h2>Finish with a staff question</h2>
      <p>
        A useful brief ends with what still needs confirmation: Is the player
        available? Which role is expected? Does the shot profile fit the
        lineup? Can the film explain the gap between box-score production and
        lineup impact? The{" "}
        <Link href="/basketball/gameplan/">game-plan workbench</Link> and{" "}
        <Link href="/basketball/roster-lab/">roster workload lab</Link> turn
        those questions into preparation context while keeping the primary
        forecast reproducible.
      </p>
      <p>
        A defensible recruiting report says what was published, what was
        measured, what remains unknown and what the staff should check next.
        That structure is more durable than a single ranking or an unverified
        portal label.
      </p>
    </>
  );
}

function BasketballAvailabilityEvidence() {
  const b = getBasketball();
  return (
    <>
      <p className="deck">
        Availability is not one field. It is a timeline of source statements,
        roster observations and official decisions, each with a different
        level of authority.
      </p>
      <p>
        The <Link href="/basketball/recruiting/">recruiting file</Link> keeps
        publisher headlines and reviewed school announcements beside their
        publication dates. The wire can surface injury, surgery, redshirt and
        return-to-play language, but a headline remains a lead until the
        underlying source answers who, when and for which competition.
      </p>
      <h2>Use the strongest source for the question</h2>
      <p>
        A school statement is the right place to verify what the program
        announced. An NCAA availability page or archive is the authority for
        the tournament reporting context it covers. A roster release shows who
        appeared in that source edition. A prior box-score row shows recorded
        participation in a past game. None of those records should be silently
        promoted into a universal health, eligibility or next-game status.
      </p>
      <p>
        Silvermine links to the NCAA&apos;s{" "}
        <a href="https://www.ncaa.com/di-mens-basketball-player-availability" target="_blank" rel="noreferrer">men&apos;s player-availability portal ↗</a>
        {" "}and its{" "}
        <a href="https://www.ncaa.com/di-mens-basketball-player-archive" target="_blank" rel="noreferrer">published archive ↗</a>
        {" "}for source verification. It does not mirror a protected
        application or infer a ruling from an absent roster row.
      </p>
      <h2>Keep the clock attached</h2>
      <p>
        Availability changes quickly. Read the source publication date, the
        archive retrieval clock and the scheduled tip together. A source that
        was current yesterday may not settle today&apos;s lineup, and a later
        statement should update the timeline rather than erase the earlier
        report. If a source date is missing, write that limitation into the
        brief instead of inventing one from the page retrieval time.
      </p>
      <h2>Do not leak availability into the baseline</h2>
      <p>
        The current 2026–27 primary forecast covers{" "}
        {b.coverage.forecast_games.toLocaleString()} games from historical team
        efficiency and pace. Recruiting, injury and roster evidence sit beside
        that estimate so a coach can decide what to verify; they do not rewrite
        the registered probability or margin. The{" "}
        <Link href="/basketball/model/">model notebook</Link> and{" "}
        <Link href="/basketball/forecast-lab/">forecast lab</Link> show the
        production estimate and the separately labeled roster scenario.
      </p>
      <h2>Finish with a review checklist</h2>
      <p>
        Open the wire and filter for availability language. Read the linked
        publisher record. Match the player to an exact source ID where one is
        available, then check the current roster observation and the official
        NCAA page when the question concerns tournament reporting. Finish the
        game brief with the unresolved question—available for this tip,
        eligible for this competition or simply listed in an older release—so
        the next staff member knows what still needs confirmation.
      </p>
      <p>
        This workflow keeps useful signals in view without overstating them.
        It also makes the missingness visible, which is the difference between
        a source-backed recruiting note and a confident guess.
      </p>
    </>
  );
}
