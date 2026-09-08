import Link from "next/link";
import { notFound } from "next/navigation";
import { getScoutIndex, getScoutProfile } from "../../../_lib/scouting-data";
import { date, fmt, signed } from "../../../_lib/format";
import { getRecruiting, getRosters } from "../../../_lib/basketball-data";
import BasketballCard from "../../../_components/BasketballCard";
import Dossier from "./Dossier";
import ProgramRecruiting from "./ProgramRecruiting";
export function generateStaticParams() {
  return getScoutIndex().teams.map((t) => ({ id: t.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = getScoutIndex().teams.find((t) => t.id === id);
  return {
    title: t
      ? `${t.name}: basketball scouting, Four Factors and player workloads`
      : "Program scouting",
    alternates: { canonical: `/basketball/programs/${id}/` },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!getScoutIndex().teams.some((t) => t.id === id)) notFound();
  const p = getScoutProfile(id),
    s = p.splits.season,
    recruiting = getRecruiting(),
    rosters = getRosters();
  return (
    <>
      <div className="dateline eyebrow">
        <Link href="/basketball/programs/">← Program library</Link>
        <span>Source edition {date(p.source_edition)}</span>
      </div>
      <section className="program-hero">
        <div>
          <div className="eyebrow">The program dossier / men’s basketball</div>
          <h1>{p.name}</h1>
          <p>
            2025–26 performance, personnel and game context.
            <br />A starting point for 2026–27 preparation.
          </p>
          <div className="hero-actions">
            <Link className="button" href={`/basketball/compare/?a=${p.id}`}>
              Build a matchup ↗
            </Link>
            <Link
              className="hero-link"
              href={`/basketball/recruiting/?team=${p.id}`}
            >
              Recruiting evidence →
            </Link>
            <Link
              className="hero-link"
              href={`/basketball/shooting/?team=${p.id}`}
            >
              Shooting lab →
            </Link>
            <Link
              className="hero-link"
              href={`/basketball/matchups/?team=${encodeURIComponent(p.name)}`}
            >
              Upcoming schedule →
            </Link>
          </div>
        </div>
        <div className="program-rank">
          <span className="eyebrow">Independent preseason model</span>
          <strong>
            <small>No.</small>
            {p.rating.rank}
          </strong>
          <p>
            {signed(p.rating.adj_net)} adjusted net
            <br />
            per 100 estimated possessions
          </p>
        </div>
      </section>
      <div className="strip">
        <div>
          <strong>
            {s.wins}–{s.losses}
            {s.ties ? `–${s.ties}` : ""}
          </strong>
          <span>2025–26 recorded finals</span>
        </div>
        <div>
          <strong>{fmt(p.rating.adj_off)}</strong>
          <span>Adjusted offense · 2026–27 baseline</span>
        </div>
        <div>
          <strong>{fmt(p.rating.adj_def)}</strong>
          <span>Adjusted defense · lower is better</span>
        </div>
        <div>
          <strong>{fmt(p.rating.adj_tempo)}</strong>
          <span>Model tempo · possessions / 40 min</span>
        </div>
      </div>
      <Dossier profile={p} />
      <ProgramRecruiting
        teamId={id}
        programName={p.name}
        recruiting={recruiting}
        rosters={rosters}
      />
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Look ahead / 2026–27</div>
            <h2>The next assignments.</h2>
          </div>
          <Link
            href={`/basketball/matchups/?team=${encodeURIComponent(p.name)}`}
          >
            Full published slate →
          </Link>
        </div>
        {p.upcoming.length ? (
          <div className="match-grid">
            {p.upcoming.slice(0, 3).map((g) => (
              <BasketballCard key={g.id} game={g} />
            ))}
          </div>
        ) : (
          <p className="empty">
            No upcoming games for this program in the partial schedule.
          </p>
        )}
      </section>
      <section className="section paper-panel">
        <h2>Read the evidence correctly.</h2>
        <p>
          The top-line adjusted ratings use the full published preseason model.
          Split statistics below them are unadjusted observations from 2025–26.
          Opponent ranks are the current model’s ranks, not what was known
          before each historical game. The “top 50” split is descriptive and
          does not enter model evaluation.
        </p>
        <p>
          Rates pool numerators and denominators from games with all fields
          required for that metric. Missing values remain unavailable; every
          metric shows its game count. Ranks require at least 10 games and
          compare programs in the model’s rated field. Ties share rank;
          percentiles use their average position. High percentiles mean
          favorable values only for metrics with a defined direction.
        </p>
        <p>
          Player workloads refer to recorded 2025–26 appearances. Estimated
          usage divides FGA + 0.475 × FTA + turnovers by minutes-prorated team
          opportunities in those same games. It assumes team opportunity rates
          were constant while a player was on court; it is not a lineup or
          play-by-play measurement. Overtime is included in available minutes.
          Minutes and usage samples can differ.
        </p>
        <p>
          Source statistics:{" "}
          <a href="https://github.com/sportsdataverse/sportsdataverse-data">
            SportsDataverse bulk releases
          </a>
          , CC BY 4.0. Calculations and model: Silvermine. Definitions draw on
          publicly documented{" "}
          <a href="https://kenpom.com/blog/stats-explained/">Four Factors</a>{" "}
          and{" "}
          <a href="https://www.basketball-reference.com/about/glossary.html">
            basketball rate statistics
          </a>
          ; these are not another publisher’s proprietary ratings.{" "}
          <Link href="/basketball/model/">Model notebook →</Link>
        </p>
      </section>
    </>
  );
}
