import Link from "next/link";
import { notFound } from "next/navigation";
import { getBasketball } from "../../../_lib/basketball-data";
import { date, fmt, kick } from "../../../_lib/format";
export function generateStaticParams() {
  return getBasketball()
    .upcoming.filter((g) => g.prediction)
    .map((g) => ({ id: g.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    g = getBasketball().upcoming.find((g) => g.id === id);
  return {
    title: g
      ? `${g.away_name} vs ${g.home_name}: 2026–27 basketball preview`
      : "Basketball preview",
    alternates: { canonical: `/basketball/briefs/${id}/` },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    d = getBasketball(),
    g = d.upcoming.find((g) => g.id === id),
    p = g?.prediction;
  if (!g || !p) notFound();
  const favorite = p.home_margin >= 0 ? g.home_name : g.away_name;
  return (
    <article className="article">
      <div className="eyebrow">
        Basketball matchup brief · Generated from model data ·{" "}
        {date(d.generated_at)}
      </div>
      <h1>
        {g.away_name}
        <br />
        vs {g.home_name}
      </h1>
      <p className="deck">
        The projected score, the uncertainty, and the next questions for the
        scouting room.
      </p>
      <p>
        The published schedule lists this game for {date(g.starts_at)}
        {g.time_tbd
          ? ", with time still to be confirmed"
          : ` at ${kick(g.starts_at)}`}
        . {g.venue ? `The listed venue is ${g.venue}.` : ""}{" "}
        {g.neutral
          ? "This is marked as a neutral-floor game."
          : "The source designates " + g.home_name + " as the home team."}{" "}
        The 2026–27 schedule is still partial and may change.
      </p>
      <h2>A possession-based first look.</h2>
      <p>
        Silvermine’s efficiency model projects {g.away_name} {fmt(p.away_score)}
        , {g.home_name} {fmt(p.home_score)}: {favorite} ahead by{" "}
        {fmt(Math.abs(p.home_margin))} points. Estimated pace is {fmt(p.pace)}{" "}
        possessions per team over 40 minutes. The projected combined score is{" "}
        {fmt(p.total)}.
      </p>
      <p>
        The home win estimate is {fmt(p.home_win_probability * 100)}%. The
        nominal 80% range for home scoring margin is {fmt(p.margin_low)} to{" "}
        {fmt(p.margin_high)} points.{" "}
        {p.margin_low <= 0 && p.margin_high >= 0
          ? "That range includes either team winning."
          : "The range sits on one side of zero; outcomes outside it remain possible."}
      </p>
      <h2>Separate team history from today’s roster.</h2>
      <p>
        This version learns offensive and defensive strength from past box
        scores while accounting for opponents and home floor. It does not yet
        include current roster composition or injuries. Before acting on the
        point estimate, confirm the players expected to be available and check
        which prior contributors remain in the rotation.
      </p>
      <p>
        The <Link href="/basketball/recruiting/">roster board</Link>{" "}
        distinguishes recorded historical program changes from future-season
        source listings. A listing can be incomplete or carried forward, so it
        should not be treated as a school-confirmed roster.
      </p>
      <h2>Three questions for film study.</h2>
      <p>
        Who can create efficient shots without turning the ball over? Which
        lineup combinations control the defensive glass? If the game slows down,
        which players can still generate good half-court opportunities? Use the{" "}
        <Link href="/basketball/players/">player statistics</Link> and{" "}
        <Link href="/basketball/impact/">NCAA impact rankings</Link> to locate
        evidence, then test those hypotheses on film. These are scouting
        prompts, not verified claims about this matchup’s tendencies.
      </p>
      <h2>How the forecast was tested.</h2>
      <p>
        The model’s independent 2025–26 evaluation covered{" "}
        {d.model.evaluation.games.toLocaleString()} games. Average margin error
        was {fmt(d.model.evaluation.margin_mae)} points; nominal 80% ranges
        covered {fmt(d.model.evaluation.interval_coverage * 100)}% of outcomes.
        Calibration used the preceding season, separate from the test games.
      </p>
      <p>
        No verified pregame betting line for this matchup has been imported. We
        cannot report a model-versus-market edge. This preview is generated
        commentary from a historical baseline, not an injury report or a
        prediction of a certain result.
      </p>
      <p>
        Source statistics and schedule:{" "}
        <a href="https://github.com/sportsdataverse/sportsdataverse-data">
          SportsDataverse
        </a>
        , CC BY 4.0. Independent calculations and text templates: Silvermine.
        Model {d.model.id}; cutoff {d.model.cutoff}.{" "}
        <Link href="/basketball/model/">Read the model notebook</Link>.
      </p>
    </article>
  );
}
