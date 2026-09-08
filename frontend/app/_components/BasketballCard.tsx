import Link from "next/link";
import type {
  BBFactorKey,
  BBGame,
  BBRosterScenario,
  BBRosterSummary,
} from "../_lib/basketball-types";
import { date, fmt, kick } from "../_lib/format";
import { forecastSignal } from "../_lib/basketball-matchups";
export default function BasketballCard({
  game: g,
  homeRoster,
  awayRoster,
  rosterScenario,
}: {
  game: BBGame;
  homeRoster?: BBRosterSummary;
  awayRoster?: BBRosterSummary;
  rosterScenario?: BBRosterScenario;
}) {
  const p = g.prediction || g.fallback_prediction || null;
  const coldStart = !g.prediction && !!g.fallback_prediction;
  const signal = p ? forecastSignal(p) : null;
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
          {coldStart && (
            <p className="forecast-caveat">
              Exploratory cold-start estimate · at least one program is outside
              the trained field. Range is calibrated wider from held-out games;
              this estimate is not registered as a primary model forecast.
            </p>
          )}
          <div className="match-detail muted">
            <span>Model signal</span>
            <span>{signal?.label}</span>
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
          {rosterScenario && (
            <div className="roster-context">
              <div className="match-detail">
                <strong>Roster challenger</strong>
                <span className="muted">research-only</span>
              </div>
              <div className="match-detail muted">
                <span>Scenario home margin</span>
                <strong>{fmt(rosterScenario.roster_margin, 1)}</strong>
              </div>
              <div className="match-detail muted">
                <span>Shift from baseline</span>
                <span>{rosterScenario.margin_delta > 0 ? "+" : ""}{fmt(rosterScenario.margin_delta, 1)} pts</span>
              </div>
              <small>
                Uses prior net efficiency and exact-ID source-listed continuity. It does not change the primary probability, range or ledger registration.
              </small>
            </div>
          )}
          {g.matchup_factors && (
            <MatchupFactorSummary
              factors={g.matchup_factors}
              homeName={g.home_name}
              awayName={g.away_name}
            />
          )}
          {(homeRoster || awayRoster) && (
            <div className="roster-context">
              <div className="match-detail muted">
                <span>Prior minutes represented · H / A</span>
                <span>
                  {rosterShare(homeRoster?.represented_prior_minutes_share)} / {rosterShare(awayRoster?.represented_prior_minutes_share)}
                </span>
              </div>
              <small>
                Observed listings only; this workload context is not an
                eligibility, availability or forecast input.
              </small>
            </div>
          )}
          {g.market_comparisons?.length ? (
            <div className="market-quotes">
              <div className="match-detail">
                <strong>Verified pregame lines</strong>
                <span className="muted">licensed feed</span>
              </div>
              {g.market_comparisons.slice(0, 3).map((quote) => (
                <div className="market-quote" key={`${quote.provider}-${quote.bookmaker}-${quote.market}`}>
                  <span>
                    {quote.bookmaker} · {quote.market}
                    <small>Captured {quote.captured_at.replace("T", " ").replace("Z", " UTC").slice(0, 22)}</small>
                  </span>
                  <strong>
                    {quote.market === "h2h"
                      ? quote.market_home_probability == null
                        ? "—"
                        : `${fmt(quote.market_home_probability * 100, 1)}% home`
                      : quote.line == null
                        ? "—"
                        : quote.market === "totals"
                          ? `O/U ${fmt(quote.line, 1)}`
                          : `Home ${quote.line > 0 ? "+" : ""}${fmt(quote.line, 1)}`}
                  </strong>
                </div>
              ))}
              <small className="factor-source">Pregame quotes are displayed only when the ledger matched the exact source game and captured them before tip. They are market observations, not recommendations.</small>
            </div>
          ) : null}
        </>
      ) : (
        <p className="note">
          No estimate is available for this game.
        </p>
      )}
      <p className="market-note">
        {g.venue || "Venue not supplied"}
        {g.broadcast ? ` · ${g.broadcast}` : ""}
        <br />
        {coldStart ? "Cold-start estimate · " : "Preseason baseline · "}
        roster changes are not model features.
        <br />
        {g.market_comparisons?.length ? "" : "No verified pregame market line imported. "}
        <Link href="/research/scorecard/?sport=basketball">
          Check the forecast record →
        </Link>
      </p>
      {g.prediction && (
        <Link className="note" href={`/basketball/briefs/${g.id}/`}>
          Read the matchup brief →
        </Link>
      )}
    </article>
  );
}

const FACTOR_META: Array<{ key: BBFactorKey; label: string }> = [
  { key: "efg", label: "Shot quality" },
  { key: "tov", label: "Ball security" },
  { key: "orb", label: "Second chances" },
  { key: "ftr", label: "Free-throw pressure" },
];

function MatchupFactorSummary({
  factors,
  homeName,
  awayName,
}: {
  factors: NonNullable<BBGame["matchup_factors"]>;
  homeName: string;
  awayName: string;
}) {
  const rows = FACTOR_META.flatMap((meta) => {
    const values = factors.factors[meta.key];
    const edge = factors.edges[meta.key];
    return values && edge != null ? [{ ...meta, values, edge }] : [];
  });
  if (!rows.length) return null;
  return (
    <div className="matchup-factors">
      <div className="match-detail">
        <strong>Why the model tilts</strong>
        <span className="muted">four-factor edge</span>
      </div>
      {rows.map((row) => (
        <div className="matchup-factor-row" key={row.key}>
          <div className="match-detail">
            <span>{row.label}</span>
            <strong className={row.edge >= 0 ? "factor-home" : "factor-away"}>
              {row.edge === 0
                ? "Even"
                : `${row.edge > 0 ? "Home" : "Away"} ${fmt(Math.abs(row.edge) * 100, 1)} pts`}
            </strong>
          </div>
          <small>
            {homeName} attack {pct(row.values.home_offense)} · {awayName} defense {pct(row.values.away_defense)}
            <br />
            {awayName} attack {pct(row.values.away_offense)} · {homeName} defense {pct(row.values.home_defense)}
          </small>
        </div>
      ))}
      <small className="factor-source">
        Opponent-adjusted rates from the {factors.season - 1}–{String(factors.season).slice(-2)} season. Positive edge favors the home side; defensive direction follows the factor (lower allowed shooting, rebounding and free-throw rates, higher forced-turnover rate).
      </small>
    </div>
  );
}

function pct(value: number) {
  return `${fmt(value * 100, 1)}%`;
}

function rosterShare(value: number | null | undefined) {
  return value == null ? "—" : `${fmt(value * 100, 0)}%`;
}
