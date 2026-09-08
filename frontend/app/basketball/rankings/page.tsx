import { getBasketball } from "../../_lib/basketball-data";
import Ratings from "../ratings/Ratings";
import Link from "next/link";

export const metadata = {
  title: "Basketball team and player rankings",
  description:
    "Compare team ratings and source-attributed player rankings across production, workload, impact and publisher models.",
  alternates: { canonical: "/basketball/ratings/" },
};

export default function Page() {
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The archived rankings desk</div>
        <h1>Power ratings, with the reasons attached.</h1>
        <p>
          Start with the team board, then choose the player lens that matches
          the question. Every player board keeps its source identity,
          qualification rules and missing values visible.
        </p>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Player ranking directory</div>
            <h2>One player, several defensible lenses.</h2>
          </div>
          <Link href="/basketball/learn/">Read the metric guide →</Link>
        </div>
        <p className="note">
          These boards answer different questions. They are not blended into a
          synthetic overall grade, and an absent value means the source or
          qualifying sample did not support that measure.
        </p>
        <div className="article-grid">
          <article className="article-card">
            <div className="eyebrow">NCAA source rankings</div>
            <h2>Counting stats and efficiency.</h2>
            <p>
              Rank points, rebounds, assists, steals, blocks, true shooting,
              effective field goal percentage and points per 40 with explicit
              game, minute, position and class filters.
            </p>
            <Link href="/basketball/ncaa-rankings/">Open NCAA rankings →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">Scouting board</div>
            <h2>Build a role-specific shortlist.</h2>
            <p>
              Weight same-season production percentiles across the historical
              archive, then preserve the exact records and source ranks behind
              a shareable shortlist.
            </p>
            <Link href="/basketball/scouting-board/">Open scouting board →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">Impact lens</div>
            <h2>Separate offense from defense.</h2>
            <p>
              Review league-wide and within-team RAPM with possession samples.
              NCAA identity keys stay separate from ESPN player IDs.
            </p>
            <Link href="/basketball/impact/">Open player impact →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">Publisher model archive</div>
            <h2>Compare attributed Box Plus/Minus.</h2>
            <p>
              Read publisher player value, offensive BPM and defensive BPM
              beside the source season and minutes without feeding it into the
              independent forecast.
            </p>
            <Link href="/basketball/boutique/?kind=players">Open publisher models →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">Historical careers</div>
            <h2>Keep seasons and programs distinct.</h2>
            <p>
              Compare source player-season production across the archive with
              workload thresholds and identity-review warnings.
            </p>
            <Link href="/basketball/ncaa-careers/">Open career rankings →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">Recruiting context</div>
            <h2>Rank the workload behind a roster row.</h2>
            <p>
              Sort source-listed 2026–27 players by prior minutes and recorded
              rates, while keeping roster observations separate from eligibility
              and future role claims.
            </p>
            <Link href="/basketball/roster-board/">Open roster workload →</Link>
          </article>
        </div>
      </section>
      <Ratings rows={getBasketball().ratings} />
    </>
  );
}
