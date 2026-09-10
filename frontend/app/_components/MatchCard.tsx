import Link from "next/link";
import type { FootballEfficiencyScenario, Game } from "../_lib/data";
import { fmt, kick } from "../_lib/format";
import { comparisonGapDirection, comparisonGapLabel } from "../_lib/market-display";
export default function MatchCard({ game: g, efficiencyScenario }: { game: Game; efficiencyScenario?: FootballEfficiencyScenario }) {
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
      {efficiencyScenario && (
        <div className="market-note">
          <strong>Efficiency challenger · research-only</strong><br />
          Margin {fmt(efficiencyScenario.challenger_margin)} · shift {efficiencyScenario.margin_delta > 0 ? "+" : ""}{fmt(efficiencyScenario.margin_delta)} pts
          <br />
          Advanced lagged rates do not change the primary probability, range or ledger.
        </div>
      )}
      {g.market_comparisons?.length ? (
        <div className="market-quotes">
          <div className="match-detail">
            <strong>Verified pregame lines</strong>
            <span className="muted">licensed ledger</span>
          </div>
          {g.market_comparisons.slice(0, 3).map((quote) => (
            <div className="market-quote" key={`${quote.provider}-${quote.bookmaker}-${quote.market}`}>
              <span>
                {quote.bookmaker} · {quote.market}
                <small>Captured {quote.captured_at.replace("T", " ").replace("Z", " UTC").slice(0, 22)}</small>
                {comparisonGapLabel(quote) && <small className={`market-gap-${comparisonGapDirection(quote)}`}>Model gap · {comparisonGapLabel(quote)}</small>}
              </span>
              <strong>
                {quote.market === "h2h"
                  ? quote.market_home_probability == null ? "—" : `${fmt(quote.market_home_probability * 100, 1)}% home`
                  : quote.line == null ? "—" : quote.market === "totals" ? `O/U ${fmt(quote.line, 1)}` : `Home ${quote.line > 0 ? "+" : ""}${fmt(quote.line, 1)}`}
              </strong>
            </div>
          ))}
          <small className="factor-source">Pregame quotes are shown only when the ledger matched the exact game and captured them before kickoff. They are observations, not recommendations.</small>
        </div>
      ) : null}
      <div className="market-note">
        {g.market ? (
          <>
            <strong>Archived market checkpoint</strong><br />
            Home spread {fmt(g.market.home_spread)} · model margin {p ? fmt(p.home_margin) : "—"} · model gap{" "}
            {fmt(g.market.margin_difference)} pts
            <br />
            {g.market.total != null && p ? `Total ${fmt(g.market.total)} · model ${fmt(p.total)} · gap ${fmt(p.total - g.market.total)} pts` : "Total unavailable in this archive row."}
            <br />
            Observed {kick(g.market.observed_at)}. Bookmaker timestamp
            unavailable; archival reference only.
          </>
        ) : (
          <>
            <strong>Market checkpoint</strong><br />
            No verified pregame line is attached to this game. The archive is
            linked from the research desk; this card never guesses a current
            price.
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
