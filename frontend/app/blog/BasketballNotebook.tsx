import Link from "next/link";
import type { BBGame } from "../_lib/basketball-types";
import { basketballEditorialLens } from "../_lib/basketball-editorial";
import { date, fmt } from "../_lib/format";
import { espnGameUrl } from "../_lib/basketball-data";
import LiveGamePublisherWire from "./LiveGamePublisherWire";

const factorLabels: Record<string, string> = {
  efg: "Shot quality",
  tov: "Ball security",
  orb: "Second chances",
  ftr: "Free-throw pressure",
};

const percent = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(1)}%`;

export default function BasketballNotebook({
  game,
  generatedAt,
}: {
  game: BBGame;
  generatedAt: string;
}) {
  const prediction = game.prediction || game.fallback_prediction;
  if (!prediction) return null;
  const lens = basketballEditorialLens(game);
  const factorRows = Object.entries(game.matchup_factors?.factors || {})
    .filter(([, values]) => values)
    .map(([key, values]) => ({
      key,
      label: factorLabels[key] || key,
      values: values!,
      edge: game.matchup_factors?.edges?.[key as keyof NonNullable<BBGame["matchup_factors"]>["edges"]],
    }));
  const coldStart = !game.prediction && !!game.fallback_prediction;
  const canonicalUrl = `https://bball.silvermine.dev/blog/basketball-game-${game.id}/`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: `${game.away_name} at ${game.home_name}: 2026–27 basketball notebook`,
    description: `Projected score, Four Factors and reporting questions for ${game.away_name} at ${game.home_name}.`,
    datePublished: generatedAt,
    dateModified: generatedAt,
    author: { "@type": "Organization", name: "Silvermine Research" },
    publisher: { "@type": "Organization", name: "Silvermine Research", url: "https://bball.silvermine.dev" },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    isAccessibleForFree: true,
    about: { "@type": "Thing", name: "Men's college basketball" },
  };

  return (
    <article className="article matchup-notebook">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <div className="eyebrow">
        Basketball matchup notebook · {date(generatedAt)} edition
      </div>
      <h1>
        {game.away_name} at {game.home_name}
      </h1>
      <p className="deck">
        A pregame research note built from the stored 2026–27 forecast, its
        source factors and the questions still waiting for film or roster
        confirmation.
      </p>

      <section className="paper-panel notebook-forecast" aria-label="Stored forecast">
        <div className="eyebrow">The baseline</div>
        <h2>
          {game.away_name} {fmt(prediction.away_score)} · {game.home_name}{" "}
          {fmt(prediction.home_score)}
        </h2>
        <div className="raw-stat-grid">
          <div><dt>Home win estimate</dt><dd>{percent(prediction.home_win_probability)}</dd></div>
          <div><dt>Projected home margin</dt><dd>{prediction.home_margin >= 0 ? "+" : ""}{fmt(prediction.home_margin)}</dd></div>
          <div><dt>80% home-margin range</dt><dd>{fmt(prediction.margin_low)} to {fmt(prediction.margin_high)}</dd></div>
          <div><dt>Estimated possessions</dt><dd>{fmt(prediction.pace)}</dd></div>
        </div>
        <p className="note">
          {coldStart
            ? "Exploratory cold-start estimate: at least one program is outside the trained field, so the wider calibrated range is the primary context."
            : "Primary preseason estimate from the published efficiency model. The range describes held-out model error, not a promise about the final score."}
        </p>
      </section>

      {lens && (
        <section className="section notebook-angle">
          <div className="eyebrow">The reporting angle</div>
          <h2>{lens.title}.</h2>
          <p>{lens.body}</p>
          <h3>Questions for the next check</h3>
          <ol>
            {lens.questions.map((question) => <li key={question}>{question}</li>)}
          </ol>
        </section>
      )}

      {factorRows.length > 0 && (
        <section className="section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Source factor context</div>
              <h2>Why the baseline leans.</h2>
            </div>
            <Link href={`/basketball/briefs/${game.id}/`}>Open the full brief →</Link>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Factor</th><th className="numeric">Home attack</th><th className="numeric">Away defense</th><th className="numeric">Away attack</th><th className="numeric">Home defense</th><th className="numeric">Edge</th></tr></thead>
              <tbody>{factorRows.map((row) => <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td className="numeric">{percent(row.values.home_offense)}</td>
                <td className="numeric">{percent(row.values.away_defense)}</td>
                <td className="numeric">{percent(row.values.away_offense)}</td>
                <td className="numeric">{percent(row.values.home_defense)}</td>
                <td className="numeric">{row.edge == null ? "—" : `${row.edge >= 0 ? "Home" : "Away"} ${Math.abs(row.edge * 100).toFixed(1)} pts`}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="note">These are the stored matchup-factor estimates for this edition. They identify a film starting point; they do not establish a tactical result or a player availability decision.</p>
        </section>
      )}

      <LiveGamePublisherWire away={game.away_name} home={game.home_name} />

      <section className="section two-col">
        <div className="paper-panel">
          <div className="eyebrow">What still needs checking</div>
          <h2>Keep the evidence chain open.</h2>
          <ul>
            <li>Confirm current availability and the expected rotation from a dated source.</li>
            <li>Use the roster and player archives to identify the personnel behind each factor.</li>
            <li>Read the interval before treating a close projection as a decisive edge.</li>
          </ul>
          <p><Link href="/basketball/recruiting/">Open recruiting evidence →</Link></p>
        </div>
        <div className="paper-panel">
          <div className="eyebrow">Source trail</div>
          <h2>Follow the record.</h2>
          <p className="note">The schedule ID, model edition and captured forecast remain attached to this notebook. A missing market observation is unavailable evidence, not a zero.</p>
          <p><Link href={`/basketball/briefs/${game.id}/`}>Read matchup evidence →</Link></p>
          <p><Link href={`/basketball/forecast-lab/?game=${encodeURIComponent(game.id)}`}>Open in forecast lab →</Link></p>
          <p><a href={espnGameUrl(game.id)} target="_blank" rel="noreferrer">Open ESPN source game ↗</a></p>
          {game.market_comparisons?.length ? <p className="note">{game.market_comparisons.length} verified pregame market observation{game.market_comparisons.length === 1 ? "" : "s"} attached to this edition.</p> : <p className="note">No verified pregame market line is attached to this edition.</p>}
        </div>
      </section>
    </article>
  );
}
