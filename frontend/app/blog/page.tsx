import { getBasketball, getRosterModel } from "../_lib/basketball-data";
import Link from "next/link";
import { getOverview } from "../_lib/data";
import { date } from "../_lib/format";
export const metadata = {
  title: "The journal: college basketball and football analysis",
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
  [
    "basketball-four-factors",
    "Read the matchup before you read the score.",
    "A practical guide to Four Factors, pace, forecast ranges and roster evidence for 2026–27 college basketball.",
  ],
  [
    "basketball-impact",
    "Read impact with the lineup context intact.",
    "How to use ORAPM, DRAPM, net RAPM and possession samples when comparing college players.",
  ],
  [
    "basketball-recruiting-workload",
    "An announcement is a starting point, not a depth chart.",
    "How to connect school statements, roster observations and prior college workload without inventing eligibility or a role.",
  ],
  [
    "basketball-player-rates",
    "A rate is only as useful as its denominator.",
    "How to read NCAA player efficiency, workload and impact rankings while keeping volume, sample size and identity boundaries visible.",
  ],
];
export default function Page() {
  const d = getOverview();
  const basketball = getBasketball();
  const rosterScenarios = new Map(
    getRosterModel().scenarios.map((scenario) => [scenario.game_id, scenario]),
  );
  const rosterLensGames = basketball.upcoming
    .filter((game) => game.prediction && rosterScenarios.has(game.id))
    .map((game) => ({ game, scenario: rosterScenarios.get(game.id)! }))
    .sort(
      (a, b) =>
        Math.abs(b.scenario.margin_delta) - Math.abs(a.scenario.margin_delta) ||
        a.game.starts_at.localeCompare(b.game.starts_at),
    )
    .slice(0, 6);
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
      <p className="note">
        <Link href="/research/briefs/">
          Browse the retained matchup reading archive →
        </Link>
      </p>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Basketball / 2026–27</div>
            <h2>From the hardwood.</h2>
          </div>
          <Link href="/basketball/matchups/">All basketball matchups →</Link>
        </div>
        <div className="article-grid">
          <article className="article-card">
            <div className="eyebrow">Basketball / Model experiment</div>
            <h2>Does another week make a better forecast?</h2>
            <p>
              Compare a weekly updating basketball model with its preseason
              baseline. Inspect monthly errors, probability calibration and the
              games behind the results.
            </p>
            <Link href="/basketball/evaluation/">Explore the experiment →</Link>
          </article>
          {basketball.upcoming
            .filter((g) => g.prediction)
            .slice(0, 6)
            .map((g) => (
              <article className="article-card" key={g.id}>
                <div className="eyebrow">{date(g.starts_at)} · Model brief</div>
                <h2>
                  {g.away_name} vs {g.home_name}
                </h2>
                <p>
                  Score estimates, pace, uncertainty and questions for the
                  scouting room.
                </p>
                <Link href={`/basketball/briefs/${g.id}/`}>
                  Read the preview →
                </Link>
              </article>
            ))}
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Recruiting lens / model disagreement</div>
            <h2>Where roster context changes the question.</h2>
          </div>
          <Link href="/basketball/forecast-lab/">Open the forecast lab →</Link>
        </div>
        <p className="note">
          These games have the largest absolute margin movement between the
          primary efficiency forecast and the research-only roster-continuity
          challenger. The challenger uses source-listed workload and publisher
          Box BPM; it does not replace the primary probability or establish
          availability.
        </p>
        <div className="article-grid">
          {rosterLensGames.map(({ game, scenario }) => (
            <article className="article-card" key={game.id}>
              <div className="eyebrow">{date(game.starts_at)} · Roster lens</div>
              <h2>{game.away_name} at {game.home_name}</h2>
              <p>
                Primary margin {scenario.base_margin > 0 ? "+" : ""}{scenario.base_margin.toFixed(1)} · roster lens {scenario.roster_margin > 0 ? "+" : ""}{scenario.roster_margin.toFixed(1)} · movement {scenario.margin_delta > 0 ? "+" : ""}{scenario.margin_delta.toFixed(1)} points.
              </p>
              <Link href={`/basketball/briefs/${game.id}/`}>Read the matchup evidence →</Link>
            </article>
          ))}
        </div>
      </section>
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
                  The projected score, unit efficiency, historical player
                  leaders and a notebook for the film room.
                </p>
                <Link href={`/blog/game-${g.id}/`}>Open the matchup →</Link>
              </article>
            ))}
        </div>
      </section>
    </>
  );
}
