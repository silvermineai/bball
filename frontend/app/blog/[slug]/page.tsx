import Link from "next/link";
import FootballBrief from "../../_components/FootballBrief";
import { notFound } from "next/navigation";
import { getOverview } from "../../_lib/data";
import { getBasketball, getRosters } from "../../_lib/basketball-data";
import { date, fmt } from "../../_lib/format";
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
};
export function generateStaticParams() {
  return [
    ...Object.keys(titles).map((slug) => ({ slug })),
    ...getOverview()
      .upcoming.filter((g) => g.prediction)
      .map((g) => ({ slug: `game-${g.id}` })),
  ];
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const g = getOverview().upcoming.find((g) => `game-${g.id}` === slug);
  const title =
    titles[slug] ||
    (g
      ? `${g.away_name} at ${g.home_name}: 2026 matchup notebook`
      : "Matchup brief");
  return {
    title,
    description: g
      ? `Projected score, unit efficiency, historical player production and scouting questions for ${g.away_name} at ${g.home_name}, ${date(g.kickoff)}.`
      : title,
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
    p = g?.prediction;
  if (!titles[slug] && (!g || !p)) notFound();
  if (g && p) return <FootballBrief game={g} overview={d} />;
  return (
    <article className="article">
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
