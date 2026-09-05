import Link from "next/link";
import { getOverview } from "../_lib/data";
import { date } from "../_lib/format";
export const metadata = {
  title: "The journal: college football matchup previews and analysis",
};
const guides = [
  [
    "reading-the-forecast",
    "What a preseason model knows. And what it misses.",
    "Start with a baseline, inspect its error, then ask which football questions the numbers cannot answer.",
  ],
  [
    "understanding-player-epa",
    "Production is a question of context.",
    "An introduction to expected points added, workload thresholds and responsible player comparisons.",
  ],
  [
    "market-comparison",
    "Before measuring an edge, check the clock.",
    "Why archived odds and verified pregame observations belong in different evaluations.",
  ],
];
export default function Page() {
  const d = getOverview();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The Coaching Annual / The journal</div>
        <h1>
          Notes from
          <br />
          the research desk.
        </h1>
        <p>
          Matchup briefs generated from our published model, plus original
          guides to reading statistics. Each brief carries the data edition and
          limitations behind its projections.
        </p>
      </div>
      <div className="article-grid">
        {guides.map(([slug, title, deck]) => (
          <article className="article-card" key={slug}>
            <div className="eyebrow">Field guide · Silvermine Research</div>
            <h2>{title}</h2>
            <p>{deck}</p>
            <Link href={`/blog/${slug}/`}>Read the guide →</Link>
          </article>
        ))}
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              Upcoming games / {date(d.generated_at)} edition
            </div>
            <h2>The matchup briefs.</h2>
          </div>
        </div>
        <div className="article-grid">
          {d.upcoming
            .filter((g) => g.prediction)
            .slice(0, 24)
            .map((g) => (
              <article className="article-card" key={g.id}>
                <div className="eyebrow">
                  Week {g.week} · {date(g.kickoff)} · Model brief
                </div>
                <h2>
                  {g.away_name} at {g.home_name}
                </h2>
                <p>
                  The projected score, uncertainty range and questions to take
                  to the film room.
                </p>
                <Link href={`/blog/game-${g.id}/`}>Open the matchup →</Link>
              </article>
            ))}
        </div>
      </section>
    </>
  );
}
