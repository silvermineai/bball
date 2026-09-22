import Link from "next/link";
import { date, fmt, signed } from "../../_lib/format";
import type { UpcomingGameLesson as Lesson } from "./upcoming-game-lesson";
import { buildUpcomingFactorStudy } from "./upcoming-game-factors";

const percent = (value: number | null) => value == null ? "—" : `${fmt(value * 100, 1)}%`;

export default function UpcomingGameLesson({
  lesson,
}: {
  lesson: Lesson | null;
}) {
  if (!lesson) {
    return (
      <section className="section paper-panel" aria-label="Upcoming game lesson">
        <div className="eyebrow">Apply the lesson / live slate</div>
        <h2>No forecast-backed game is ready to study.</h2>
        <p className="note">The lesson waits for a complete published forecast rather than filling missing values.</p>
      </section>
    );
  }
  const { game, prediction } = lesson;
  const estimate = lesson.favoriteName
    ? `${lesson.favoriteName} by ${fmt(Math.abs(prediction.home_margin), Math.abs(prediction.home_margin) < 1 ? 2 : 1)}`
    : "Even projected score";
  const rangeReading =
    lesson.marginReading === "both-outcomes"
      ? "The stored 80% margin range includes both teams winning. Treat the point estimate as a starting point, then investigate the uncertainty."
      : "The stored 80% margin range stays on one side of zero. It still describes historical model error, not a guarantee.";
  const factorStudy = buildUpcomingFactorStudy(game);
  const factorLabel = factorStudy.lineage === "same-edition"
    ? "Same-edition context"
    : factorStudy.lineage === "other-edition"
      ? "Other-edition context"
      : "Factor context unavailable";
  return (
    <section className="section learning-next-game" aria-labelledby="learning-next-game-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Apply the lesson / next forecast-backed game</div>
          <h2 id="learning-next-game-title">Read one real matchup in three passes.</h2>
        </div>
        <span className="note">{date(game.starts_at)}</span>
      </div>
      <div className="learning-next-game-header">
        <div>
          <div className="eyebrow">{game.away_name} at {game.home_name}</div>
          <h3>{estimate}</h3>
          <p className="note">
            {prediction.estimate_type === "cold_start" ? "Cold-start estimate · wider prior" : "Published model baseline"}
            {game.neutral ? " · neutral floor" : " · designated home floor"}
          </p>
        </div>
        <Link className="button" href={`/basketball/briefs/${encodeURIComponent(game.id)}/`}>
          Open the evidence brief ↗
        </Link>
      </div>
      <div className="strip learning-next-game-strip">
        <div><strong>{fmt(prediction.away_score)}–{fmt(prediction.home_score)}</strong><span>Projected score · away–home</span></div>
        <div><strong>{fmt(prediction.home_win_probability * 100)}%</strong><span>Home win estimate</span></div>
        <div><strong>{signed(prediction.margin_low)} to {signed(prediction.margin_high)}</strong><span>Nominal 80% home-margin range</span></div>
        <div><strong>{fmt(prediction.pace, 1)}</strong><span>Projected possessions / 40 min</span></div>
      </div>
      <div className="two-col learning-next-game-columns">
        <article className="paper-panel">
          <div className="eyebrow">Pass 01 / Point estimate</div>
          <h3>What does the baseline say?</h3>
          <p>
            Start with the projected score, expected margin and home win
            estimate. The model favors {lesson.favoriteName || "neither team"} with a {lesson.forecastReading} signal.
          </p>
          <p className="note">This is a historical-efficiency baseline. It does not include confirmed current injuries, eligibility or lineups.</p>
        </article>
        <article className="paper-panel">
          <div className="eyebrow">Pass 02 / Uncertainty</div>
          <h3>How much room is there for the other result?</h3>
          <p>{rangeReading}</p>
          <p className="note">The range is attached to this exact game and model edition; it is not a market line.</p>
        </article>
      </div>
      <article className="paper-panel learning-factor-study" aria-labelledby="learning-factor-study-title">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Pass 03 / Four-factor map</div>
            <h3 id="learning-factor-study-title">Turn the forecast into a study question.</h3>
          </div>
          <span className="note">{factorLabel}{factorStudy.season ? ` · ${factorStudy.season - 1}–${String(factorStudy.season).slice(-2)}` : ""}</span>
        </div>
        {factorStudy.lineage === "other-edition" && <p className="status-warn">These rates are retained descriptive context from {factorStudy.modelId || "an older edition"}. They did not generate this forecast and are shown as a study prompt.</p>}
        {factorStudy.lineage === "unavailable" && <p className="note">No retained Four Factor context is attached to this game. Missing rates stay unavailable rather than being inferred from another team or season.</p>}
        {factorStudy.lineage !== "unavailable" && <div className="learning-factor-table table-scroll">
          <table className="data-table">
            <thead><tr><th>Factor</th><th>{game.home_name} attack</th><th>{game.away_name} defense</th><th>{game.away_name} attack</th><th>{game.home_name} defense</th><th>Stored edge</th></tr></thead>
            <tbody>{factorStudy.rows.map((row) => <tr key={row.key}>
              <th scope="row">{row.label}<small className="learning-factor-question">{row.question}</small></th>
              <td>{percent(row.homeOffense)}</td><td>{percent(row.awayDefense)}</td><td>{percent(row.awayOffense)}</td><td>{percent(row.homeDefense)}</td>
              <td className={row.edge == null ? undefined : row.edge >= 0 ? "factor-home" : "factor-away"}>{row.edge == null ? "—" : row.edge === 0 ? "Even" : `${row.edge > 0 ? "Home" : "Away"} ${fmt(Math.abs(row.edge) * 100, 1)} pp`}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <p className="note learning-factor-source">Positive edge favors the home side; defensive direction follows the factor. The rates describe the retained source profile and are not a player availability claim.</p>
      </article>
      <article className="paper-panel learning-next-game-question">
        <div className="eyebrow">Pass 04 / Evidence question</div>
        <h3>What would you check before carrying the baseline into preparation?</h3>
        <ol>
          <li>Open the evidence brief and compare both directions of the Four Factors.</li>
          <li>Check source-listed roster observations and prior minutes without treating a listing as availability.</li>
          <li>Write one film question tied to the largest historical contrast, then record what remains unknown.</li>
        </ol>
        <div className="button-row">
          <Link href={`/basketball/briefs/${encodeURIComponent(game.id)}/#roster-evidence`}>Check the matchup evidence →</Link>
          <Link href="/basketball/evaluation/">Review the model test →</Link>
        </div>
      </article>
    </section>
  );
}
