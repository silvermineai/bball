import Link from "next/link";
import { notFound } from "next/navigation";
import { getOverview } from "../../_lib/data";
import { date, fmt, kick } from "../../_lib/format";
const titles: Record<string, string> = {
  "reading-the-forecast": "What a preseason model knows. And what it misses.",
  "understanding-player-epa": "Production is a question of context.",
  "market-comparison": "Before measuring an edge, check the clock.",
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
      ? `${g.away_name} at ${g.home_name}: 2026 matchup preview`
      : "Matchup brief");
  return {
    title,
    description: g
      ? `Projected score, uncertainty and scouting questions for ${g.away_name} at ${g.home_name}, ${date(g.kickoff)}.`
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
  if (g && p) {
    const favorite = p.home_margin >= 0 ? g.home_name : g.away_name,
      uncertain = p.margin_low <= 0 && p.margin_high >= 0;
    return (
      <article className="article">
        <div className="eyebrow">
          Matchup brief · Template-generated from model data ·{" "}
          {date(d.generated_at)}
        </div>
        <h1>
          {g.away_name}
          <br />
          at {g.home_name}
        </h1>
        <p className="deck">
          A first look at the matchup, with the numbers and their uncertainty on
          the same page.
        </p>
        <p>
          {g.away_name} visits {g.home_name} on {date(g.kickoff)}
          {g.time_tbd
            ? ", with kickoff time to be determined"
            : `, at ${kick(g.kickoff)}`}
          . {g.venue ? `The scheduled venue is ${g.venue}.` : ""}{" "}
          {g.neutral
            ? "The source lists this as a neutral-site game, so the model removes its home-field term."
            : "The model includes its learned home-field effect."}
        </p>
        <h2>The baseline projection</h2>
        <p>
          Our score model estimates {g.away_name} {fmt(p.away_score)},{" "}
          {g.home_name} {fmt(p.home_score)}. That places {favorite} ahead by{" "}
          {fmt(Math.abs(p.home_margin))} points, with a projected total of{" "}
          {fmt(p.total)}. The home win estimate is{" "}
          {fmt(p.home_win_probability * 100)}%, using a probability curve
          calibrated on {d.model.calibration.season} game outcomes.
        </p>
        <p>
          The 80% range for the home scoring margin runs from{" "}
          {fmt(p.margin_low)} to {fmt(p.margin_high)} points.{" "}
          {uncertain
            ? "That interval includes a win by either team. The point estimate should not be mistaken for a confident outcome."
            : "The interval sits on one side of zero, but unexpected roster changes and game conditions can still create outcomes outside it."}
        </p>
        <h2>What to check before kickoff</h2>
        <p>
          Confirm the starting quarterback and offensive-line continuity. This
          model uses program identities and historical scores, so a major
          personnel change will not be reflected directly. Examine each team’s
          most recent player workloads and compare performance within the same
          role before drawing conclusions from a production ranking.
        </p>
        <p>
          Use the matchup as a film-study starting point: which unit can create
          favorable down-and-distance situations, and which players are
          responsible for that production? These are scouting questions, not
          claims about tendencies we have verified for this game.
        </p>
        <h2>The market checkpoint</h2>
        <p>
          Follow registered forecasts and observed lines in the{" "}
          <Link href="/research/scorecard/">prospective scorecard</Link>.
        </p>
        <p>
          {g.market
            ? `The imported archive contains a home spread of ${fmt(g.market.home_spread)}. Its observation time is ${kick(g.market.observed_at)}, but a bookmaker publication timestamp is unavailable. Treat it as an archive reference rather than a live quote.`
            : "There is no verified pregame line for this game in the imported dataset. A model-versus-market edge cannot be reported yet. We retain the absence instead of filling it with a guessed price."}
        </p>
        <h2>How much weight to give this forecast</h2>
        <p>
          The {d.model.version} model was evaluated on{" "}
          {d.model.evaluation.games} games from {d.model.evaluation.season},
          using only earlier seasons for fitting. Its mean absolute margin error
          was {fmt(d.model.evaluation.margin_mae)} points. The production model
          uses completed FBS results through the published cutoff, but does not
          explicitly include transfers, injuries, coaching changes or weather.
        </p>
        <p>
          Model: {d.model.id}. Data edition: {d.model.cutoff}. Schedule and
          source statistics:{" "}
          <a href="https://github.com/sportsdataverse/sportsdataverse-data">
            SportsDataverse
          </a>{" "}
          (CC BY 4.0). Silvermine supplies the independent model and generated
          commentary.
        </p>
        <p>
          <Link href="/football/methodology/">Read the full methodology</Link> ·{" "}
          <Link href="/football/matchups/">Return to matchups</Link>
        </p>
      </article>
    );
  }
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
