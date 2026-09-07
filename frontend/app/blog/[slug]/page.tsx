import Link from "next/link";
import FootballBrief from "../../_components/FootballBrief";
import { notFound } from "next/navigation";
import { getOverview } from "../../_lib/data";
import { getBasketball } from "../../_lib/basketball-data";
import { date, fmt } from "../../_lib/format";
const titles: Record<string, string> = {
  "reading-the-forecast": "What a preseason model knows. And what it misses.",
  "understanding-player-epa": "Production is a question of context.",
  "market-comparison": "Before measuring an edge, check the clock.",
  "basketball-four-factors": "Read the matchup before you read the score.",
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
