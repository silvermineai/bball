import Link from "next/link";
import type { BBGame } from "../_lib/basketball-types";
import { date, fmt, kick } from "../_lib/format";
export default function BasketballCard({ game: g }: { game: BBGame }) {
  const p = g.prediction;
  return (
    <article className="match-card">
      <div className="meta">
        <span>{g.neutral ? "NEUTRAL FLOOR" : "ON THE SCHEDULE"}</span>
        <span>
          {g.time_tbd ? `${date(g.starts_at)} · TIME TBD` : kick(g.starts_at)}
        </span>
      </div>
      <h3>
        {g.away_name}
        <span className="muted"> vs </span>
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
            <span>{g.home_name} win estimate</span>
            <strong className="mono">
              {fmt(p.home_win_probability * 100)}%
            </strong>
          </div>
          <div className="match-detail muted">
            <span>Projected home margin</span>
            <span>{fmt(p.home_margin, 1)}</span>
          </div>
          <div className="match-detail muted">
            <span>Projected total</span>
            <span>{fmt(p.total, 1)}</span>
          </div>
          <div className="match-detail muted">
            <span>80% home-margin range</span>
            <span>
              {fmt(p.margin_low)} to {fmt(p.margin_high)}
            </span>
          </div>
          <div className="match-detail muted">
            <span>Estimated possessions</span>
            <span>{fmt(p.pace)}</span>
          </div>
        </>
      ) : (
        <p className="note">
          No forecast: at least one program lacks enough observed training
          games.
        </p>
      )}
      <p className="market-note">
        {g.venue || "Venue not supplied"}
        {g.broadcast ? ` · ${g.broadcast}` : ""}
        <br />
        Preseason baseline · roster changes are not model features.
        <br />
        No verified pregame market line imported.
      </p>
      {p && (
        <Link className="note" href={`/basketball/briefs/${g.id}/`}>
          Read the matchup brief →
        </Link>
      )}
    </article>
  );
}
