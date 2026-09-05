import Link from "next/link";
import type { Game } from "../_lib/data";
import { fmt, kick } from "../_lib/format";
export default function MatchCard({ game: g }: { game: Game }) {
  const p = g.prediction;
  return (
    <article className="match-card">
      <div className="meta">
        <span>
          WEEK {g.week} · {g.neutral ? "NEUTRAL" : "HOME / AWAY"}
        </span>
        <span>{g.time_tbd ? "TIME TBD" : kick(g.kickoff)}</span>
      </div>
      <h3>
        {g.away_name}
        <span className="muted"> at </span>
        {g.home_name}
      </h3>
      {p ? (
        <>
          <div className="prediction-score">
            <div>
              {fmt(p.away_score)}
              <small>{g.away_name}</small>
            </div>
            <div>
              {fmt(p.home_score)}
              <small>{g.home_name}</small>
            </div>
          </div>
          <div className="prob-bar" aria-hidden="true">
            <span style={{ width: `${p.home_win_probability * 100}%` }} />
          </div>
          <div className="match-detail">
            <span>Home win estimate</span>
            <strong className="mono">
              {fmt(p.home_win_probability * 100)}%
            </strong>
          </div>
          <div className="match-detail muted">
            <span>80% home-margin range</span>
            <span>
              {fmt(p.margin_low)} to {fmt(p.margin_high)}
            </span>
          </div>
        </>
      ) : (
        <p className="note">
          No forecast: a team is outside the model’s trained FBS field. Schedule
          retained for planning.
        </p>
      )}
      <div className="market-note">
        {g.market ? (
          <>
            Archived home line {fmt(g.market.home_spread)} · model difference{" "}
            {fmt(g.market.margin_difference)} pts
            <br />
            Observed {kick(g.market.observed_at)}. Bookmaker timestamp
            unavailable.
          </>
        ) : (
          <>
            Market comparison pending · no verified pregame line in this
            dataset.
          </>
        )}
      </div>
      {p && (
        <Link className="note" href={`/blog/game-${g.id}/`}>
          Read the matchup brief →
        </Link>
      )}
    </article>
  );
}
