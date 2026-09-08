import Link from "next/link";
import { espnGameUrl, getBasketball } from "../../_lib/basketball-data";
import type { BBGame } from "../../_lib/basketball-types";
import { date, fmt, signed } from "../../_lib/format";

export const metadata = {
  title: "Basketball press room",
  description:
    "Model-generated story angles and forecast context for upcoming college basketball games.",
  alternates: { canonical: "/basketball/pressroom/" },
};

const forecasted = (games: BBGame[]) => games.filter((game) => game.prediction);

function signal(game: BBGame) {
  const p = game.prediction!;
  const margin = Math.abs(p.home_margin);
  if (margin < 2) return "A one-possession setup: the model sees little separation.";
  const favorite = p.home_margin > 0 ? game.home_name : game.away_name;
  if (margin >= 10) return `${favorite} carries the clearest projected control in this slate.`;
  return `${favorite} has the model edge, with enough uncertainty to keep the matchup live.`;
}

function GameCard({ game }: { game: BBGame }) {
  const p = game.prediction!;
  return (
    <article className="article-card">
      <div className="eyebrow">{date(game.starts_at)} · {game.time_tbd ? "Start time unconfirmed" : "Scheduled"}</div>
      <h2>
        {game.away_name} <span className="brief-versus">at</span> {game.home_name}
      </h2>
      <p>{signal(game)}</p>
      <dl>
        <div><dt>Projected score</dt><dd>{game.away_name} {fmt(p.away_score, 1)} · {game.home_name} {fmt(p.home_score, 1)}</dd></div>
        <div><dt>Home win probability</dt><dd>{fmt(p.home_win_probability * 100, 1)}%</dd></div>
        <div><dt>Margin range</dt><dd>{signed(p.margin_low)} to {signed(p.margin_high)} home</dd></div>
        <div><dt>Projected pace</dt><dd>{fmt(p.pace, 1)} possessions</dd></div>
      </dl>
      <div className="brief-archive-links">
        <Link href={`/basketball/briefs/${game.id}/`}>Open scouting brief →</Link>
        <Link href={`/basketball/compare/?a=${game.away_id}&b=${game.home_id}`}>Compare programs</Link>
        <a href={espnGameUrl(game.id)} target="_blank" rel="noreferrer">Open ESPN source game ↗</a>
      </div>
    </article>
  );
}

export default function Page() {
  const games = forecasted(getBasketball().upcoming);
  const strongest = [...games].sort(
    (a, b) => Math.abs(b.prediction!.home_win_probability - 0.5) - Math.abs(a.prediction!.home_win_probability - 0.5),
  )[0];
  const closest = [...games].sort((a, b) => Math.abs(a.prediction!.home_margin) - Math.abs(b.prediction!.home_margin))[0];
  const widest = [...games].sort(
    (a, b) => (b.prediction!.margin_high - b.prediction!.margin_low) - (a.prediction!.margin_high - a.prediction!.margin_low),
  )[0];
  const featured = [...new Map([strongest, closest, widest].filter(Boolean).map((game) => [game!.id, game!])).values()];
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">For the writers / 2026–27 forecast slate</div>
        <h1>
          Find the angle.
          <br />
          <em>Check the evidence.</em>
        </h1>
        <p>
          A native press desk for upcoming games, built from the published
          Silvermine forecast and linked scouting briefs. Start with a signal,
          then open the matchup context before writing.
        </p>
      </div>
      <div className="strip">
        <div><strong>{games.length.toLocaleString()}</strong><span>Forecasted games</span></div>
        <div><strong>{featured.length}</strong><span>Featured story angles</span></div>
        <div><strong>80%</strong><span>Nominal margin interval</span></div>
        <div><strong>40</strong><span>Regulation-minute pace basis</span></div>
      </div>
      <section className="section">
        <div className="section-heading">
          <div><div className="eyebrow">Three ways into the slate</div><h2>Start with a signal.</h2></div>
        </div>
        <p className="note">Featured cards are selected from model confidence, projected closeness and interval width. The language is a writing prompt, not a human-edited article or a claim about injuries, availability or betting value.</p>
        <div className="article-grid">{featured.map((game) => <GameCard key={game.id} game={game} />)}</div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div><div className="eyebrow">The full forecast desk</div><h2>Open the next brief.</h2></div>
          <Link href="/basketball/briefs/">Browse every game brief →</Link>
        </div>
        <div className="article-grid">
          {games.slice(0, 12).map((game) => <GameCard key={game.id} game={game} />)}
        </div>
      </section>
      <p className="note">Forecasts use historical team efficiency and venue only. They do not include injuries, transfers, eligibility, current lineup confirmation or bookmaker prices. Read the <Link href="/basketball/model/">model notebook</Link> and the <Link href="/research/scorecard/?sport=basketball">forecast record</Link> for methods and timing.</p>
    </>
  );
}
