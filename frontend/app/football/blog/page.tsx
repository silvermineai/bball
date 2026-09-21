import Link from "next/link";
import { getOverview } from "../../_lib/data";
import { date, fmt, kick, signed } from "../../_lib/format";
import { selectFootballBlogGames } from "./football-blog-index";

export const metadata = {
  title: "Football game notebooks and matchup analysis",
  description: "Forecast-backed football game notebooks with model context, unit questions, player production and market evidence.",
  alternates: { canonical: "/football/blog/" },
};

const division = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return normalized === "fbs" || normalized === "fcs" ? normalized.toUpperCase() : normalized ? normalized.toUpperCase() : "Division unavailable";
};

export default function Page() {
  const overview = getOverview();
  const games = selectFootballBlogGames(overview.upcoming);
  const next = games[0];
  return <>
    <div className="page-title">
      <div className="eyebrow">Football notebooks / {overview.season} forecast edition</div>
      <h1>Prepare for the next game.</h1>
      <p>Forecast-backed game notebooks turn the football slate into a review queue. Start with the persisted score and range, then move through unit production, personnel context, the market record and the next film question.</p>
      <div className="hero-actions"><Link className="button" href="/football/matchups/">Open the matchup desk ↗</Link><Link className="hero-link" href="/football/learn/">Read the football field guide →</Link><Link className="hero-link" href="/research/scorecard/?sport=football">Audit the model record →</Link></div>
    </div>
    <div className="strip"><div><strong>{games.length.toLocaleString()}</strong><span>Forecast-backed notebooks</span></div><div><strong>{overview.coverage.forecast_games.toLocaleString()}</strong><span>Published forecast rows</span></div><div><strong>{overview.model.evaluation.games.toLocaleString()}</strong><span>Held-out games</span></div><div><strong>{next ? date(next.kickoff) : "—"}</strong><span>Next scheduled date</span></div></div>
    <section className="section">
      <div className="section-heading"><div><div className="eyebrow">Upcoming game queue / source-bound</div><h2>Open a matchup notebook.</h2></div><span className="note">Model {overview.model.id}</span></div>
      <p className="note">Every card links to a generated notebook for an exact published game and forecast. Rows without a persisted forecast remain available on the matchup desk and are not turned into implied predictions.</p>
      <div className="article-grid">{games.map((game) => { const prediction = game.prediction!; const uncertain = prediction.margin_low <= 0 && prediction.margin_high >= 0; return <article className="article-card" key={game.id}>
        <div className="eyebrow">{date(game.kickoff)} · Week {game.week} · {division(game.home_division)}</div>
        <h2>{game.away_name} <span className="brief-versus">at</span> {game.home_name}</h2>
        <p>{uncertain ? "The stored range includes a win by either team." : "The stored range falls on one side of zero, but outcomes outside it remain possible."}</p>
        <dl><div><dt>Projected score</dt><dd>{game.away_name} {fmt(prediction.away_score, 1)} · {game.home_name} {fmt(prediction.home_score, 1)}</dd></div><div><dt>Home win estimate</dt><dd>{fmt(prediction.home_win_probability * 100, 1)}%</dd></div><div><dt>Home margin range</dt><dd>{signed(prediction.margin_low)} to {signed(prediction.margin_high)}</dd></div><div><dt>Kickoff</dt><dd>{game.time_tbd ? "Time unconfirmed" : kick(game.kickoff)} · {game.venue || "Venue unavailable"}</dd></div></dl>
        <p className="note">Forecast ID <code>{prediction.model_id || overview.model.id}</code> · captured {prediction.generated_at ? date(prediction.generated_at) : date(overview.generated_at)}.</p>
        <Link href={`/blog/game-${encodeURIComponent(game.id)}/`}>Open the full game notebook →</Link>
      </article>; })}</div>
      {!games.length && <p className="empty">No forecast-backed football games are available in the current published edition.</p>}
    </section>
    <section className="section two-col"><article className="paper-panel"><div className="eyebrow">Read the number in context</div><h2>What the notebook adds.</h2><p>The full read combines team model arithmetic, prior-season player leaders, efficiency profiles, dated source receipts, personnel readiness and the market checkpoint. Missing or mismatched evidence stays unavailable.</p><Link href="/football/matchups/">Browse all divisions →</Link></article><article className="paper-panel"><div className="eyebrow">Keep the model honest</div><h2>Forecasts have a boundary.</h2><p>The published production model uses retained team history, prior scores and venue. Injury, weather, transfer and depth-chart information is shown as context until a validated model edition explicitly incorporates it.</p><Link href="/football/methodology/">Read the model methodology →</Link></article></section>
  </>;
}
