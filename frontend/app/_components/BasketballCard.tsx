import Link from "next/link";
import type {
  BBFactorKey,
  BBGame,
  BBRosterScenario,
  BBRosterSummary,
  BBTeam,
} from "../_lib/basketball-types";
import { date, fmt, kick } from "../_lib/format";
import { comparisonGapDirection, comparisonGapLabel } from "../_lib/market-display";
import { forecastEvidenceCoverage, forecastEvidenceDetail, forecastEvidenceLabel, forecastIntegrity, forecastSignalContext, forecastUnknownTeams, matchupFactorStudyQuestion, strongestMatchupSignal } from "../_lib/forecast-lab-analysis";
import { latestForecastLabMarketQuote } from "../_lib/forecast-lab-market";
import { resolveForecastEdition } from "../_lib/forecast-edition";

export default function BasketballCard({
  game: g,
  homeRoster,
  awayRoster,
  rosterScenario,
  homeRating,
  awayRating,
  publisherHomeRating,
  publisherAwayRating,
  forecastModelId,
  forecastCreatedAt,
}: {
  game: BBGame;
  homeRoster?: BBRosterSummary;
  awayRoster?: BBRosterSummary;
  rosterScenario?: BBRosterScenario;
  homeRating?: BBTeam;
  awayRating?: BBTeam;
  publisherHomeRating?: { team: string; value: number | null };
  publisherAwayRating?: { team: string; value: number | null };
  forecastModelId?: string | null;
  forecastCreatedAt?: string | null;
}) {
  const p = g.prediction || g.fallback_prediction || null;
  const forecastEdition = resolveForecastEdition(g, {
    modelId: forecastModelId,
    generatedAt: forecastCreatedAt,
  });
  const coldStart = !g.prediction && !!g.fallback_prediction;
  const signalContext = forecastSignalContext(p, !!g.prediction);
  const strongestFactor = strongestMatchupSignal(g.matchup_factors);
  const unknownTeams = forecastUnknownTeams(p);
  const marketQuotes = (["spreads", "totals", "h2h"] as const)
    .map((market) => latestForecastLabMarketQuote(g.market_comparisons || [], market))
    .filter((quote): quote is NonNullable<typeof quote> => quote !== null);
  const contextLayers = [
    g.matchup_factors
      ? g.matchup_factors_same_edition === false ? "factor context · other edition" : "four factors"
      : null,
    homeRating && awayRating ? "team ratings" : null,
    homeRoster && awayRoster ? "roster minutes" : null,
    rosterScenario ? "roster scenario" : null,
  ].filter((value): value is string => value !== null);
  const evidence = forecastEvidenceCoverage({
    primary: !!g.prediction,
    scheduled: !!(g.source_time_valid && g.source_start),
    factors: !!g.matchup_factors && g.matchup_factors_same_edition !== false,
    roster: !!rosterScenario,
    market: marketQuotes.length > 0,
  });
  const integrity = forecastIntegrity(g, forecastEdition.modelId);
  const scheduleLabel = g.source_time_valid && g.source_start
    ? "confirmed tip"
    : g.time_tbd
      ? "time TBD"
      : "scheduled tip";
  return (
    <article className="match-card">
      <div className="meta">
        <span>{g.neutral ? "NEUTRAL FLOOR" : "ON THE SCHEDULE"}</span>
        <span>
          {g.source_time_valid && g.source_start
            ? `schedule ${kick(g.source_start)}`
            : g.time_tbd
              ? `${date(g.starts_at)} · TIME TBD`
              : kick(g.starts_at)}
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
          <div className="analysis-readiness" aria-label="Game analysis packet">
            <div className="analysis-readiness-heading">
              <strong>Game analysis packet</strong>
              <span>{forecastEvidenceLabel(evidence)}</span>
            </div>
            <div className="analysis-badges">
              <span className={`analysis-badge ${evidence.complete ? "is-ready" : ""}`}>{coldStart ? "cold-start estimate" : "primary model"}</span>
              <span className="analysis-badge">{scheduleLabel}</span>
              {contextLayers.map((layer) => <span className="analysis-badge" key={layer}>{layer}</span>)}
            </div>
            <small className="analysis-readiness-note">{forecastEvidenceDetail(evidence)}</small>
            <small className={integrity.ok ? "analysis-integrity" : "analysis-integrity is-review"}>
              Data integrity: <strong>{integrity.label}</strong>
              {integrity.missing.length ? ` · ${integrity.missing.join(", ")}` : " · prediction and lineage checks passed"}
            </small>
          </div>
          <div className="match-detail">
            <span>{g.home_name} win estimate</span>
            <strong className="mono">
              {fmt(p.home_win_probability * 100)}%
            </strong>
          </div>
          {coldStart && (
            <p className="forecast-caveat">
              Exploratory cold-start estimate · {unknownTeams.length
                ? `unmodeled program${unknownTeams.length === 1 ? "" : "s"}: ${unknownTeams.join(", ")}. `
                : "at least one program is outside the trained field. "}
              Range is calibrated wider from held-out games; this estimate is
              not registered as a primary model forecast.
            </p>
          )}
          <div className="match-detail muted">
            <span>Model signal</span>
            <span>{signalContext.label}</span>
          </div>
          <div className="match-detail muted">
            <span>Range context</span>
            <span>{signalContext.range_context}</span>
          </div>
          <div className="match-detail muted">
            <span>Forecast edition</span>
            <span>{forecastEdition.modelId || "edition unavailable"}</span>
          </div>
          <div className="match-detail muted">
            <span>Forecast generated</span>
            <span>{forecastEdition.generatedAt ? kick(forecastEdition.generatedAt) : "clock unavailable"}</span>
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
            <span>80% range width</span>
            <span>{signalContext.range_width == null ? "—" : `${fmt(signalContext.range_width, 1)} pts`}</span>
          </div>
          <div className="match-detail muted">
            <span>Estimated possessions</span>
            <span>{fmt(p.pace)}</span>
          </div>
          <div className="match-detail muted">
            <span>Projected efficiency · A / H</span>
            <span>{p.away_efficiency == null || p.home_efficiency == null ? "—" : `${fmt(p.away_efficiency, 1)} / ${fmt(p.home_efficiency, 1)} pts per 100`}</span>
          </div>
          <div className="match-detail muted">
            <span>Largest factor mismatch</span>
            <span>
              {strongestFactor
                ? `${strongestFactor.edge > 0 ? "Home" : "Away"} ${strongestFactor.label} · ${fmt(Math.abs(strongestFactor.edge) * 100, 1)} pp`
                : "No same-edition factor evidence"}
            </span>
          </div>
          {(homeRating || awayRating || rosterScenario || g.matchup_factors || homeRoster || awayRoster) && (
            <details className="match-card-details">
              <summary>Open matchup evidence</summary>
              {(homeRating || awayRating) && (
            <div className="rating-context">
              <div className="match-detail">
                <strong>Historical strength context</strong>
                <span className="muted">Silvermine 2025–26</span>
              </div>
              <div className="match-detail muted">
                <span>Adjusted net · H / A</span>
                <span>{fmt(homeRating?.adj_net, 1)} / {fmt(awayRating?.adj_net, 1)}</span>
              </div>
              <div className="match-detail muted">
                <span>SOS · H / A</span>
                <span>{fmt(homeRating?.sos, 1)} / {fmt(awayRating?.sos, 1)}</span>
              </div>
              {(publisherHomeRating || publisherAwayRating) && (
                <div className="match-detail muted">
                  <span>Archived adjusted EM · H / A</span>
                  <span>{fmt(publisherHomeRating?.value, 1)} / {fmt(publisherAwayRating?.value, 1)}</span>
                </div>
              )}
              <div className="button-row" style={{ marginTop: 8 }}>
                {homeRating && <Link className="text-link" href={`/basketball/boutique/?kind=ratings&season=2026&metric=adj_em&q=${encodeURIComponent(homeRating.name)}`}>Compare {homeRating.name} archived rating ↗</Link>}
                {awayRating && <Link className="text-link" href={`/basketball/boutique/?kind=ratings&season=2026&metric=adj_em&q=${encodeURIComponent(awayRating.name)}`}>Compare {awayRating.name} archived rating ↗</Link>}
              </div>
              <small>
                Prior opponent-adjusted team strength and schedule context. It is descriptive history; roster changes, injuries and the forecast model remain separate.
              </small>
            </div>
              )}
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
              <div className="match-detail muted">
                <span>Scenario home win</span>
                <span>{fmt(rosterScenario.roster_home_win_probability * 100, 1)}%</span>
              </div>
              <div className="match-detail muted">
                <span>Scenario predicted net · A / H</span>
                <span>{fmt(rosterScenario.away_predicted_net, 1)} / {fmt(rosterScenario.home_predicted_net, 1)}</span>
              </div>
              <div className="match-detail muted">
                <span>Scenario margin range</span>
                <span>{fmt(rosterScenario.roster_margin_low, 1)} to {fmt(rosterScenario.roster_margin_high, 1)}</span>
              </div>
              <small>
                Uses prior net efficiency and exact-ID recorded continuity. The team-net pair shows the scenario&apos;s predicted efficiency levels for the away and home teams. Probability and range reuse this primary edition&apos;s held-out calibration; the scenario does not replace the prospective ledger forecast.
              </small>
            </div>
          )}
          {g.matchup_factors && (
            <MatchupFactorSummary
              factors={g.matchup_factors}
              homeName={g.home_name}
              awayName={g.away_name}
              modelId={g.matchup_factors_model_id}
              sameEdition={g.matchup_factors_same_edition !== false}
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
              <div className="match-detail muted">
                <span>Prior minutes needing review · H / A</span>
                <span>
                  {rosterMinutes(homeRoster?.unrepresented_prior_minutes)} / {rosterMinutes(awayRoster?.unrepresented_prior_minutes)}
                </span>
              </div>
              <small>
                Observed listings only; this workload context is not an
                eligibility, availability or forecast input. The review-minute
                measure is a review queue, not a departure count.
              </small>
            </div>
          )}
            </details>
          )}
          <div className="button-row matchup-program-links" aria-label="Program research links">
            <Link className="note" href={`/basketball/programs/${encodeURIComponent(g.away_id)}/`}>Away program dossier ↗</Link>
            <Link className="note" href={`/basketball/programs/${encodeURIComponent(g.home_id)}/`}>Home program dossier ↗</Link>
            <Link className="note" href={`/blog/basketball-game-${encodeURIComponent(g.id)}/`}>Game notebook ↗</Link>
          </div>
          {marketQuotes.length ? (
            <div className="market-quotes">
              <div className="match-detail">
                <strong>Verified pregame lines</strong>
                <span className="muted">verified line feed</span>
              </div>
              {marketQuotes.map((quote) => (
                <div className="market-quote" key={`${quote.provider}-${quote.bookmaker}-${quote.market}`}>
                  <span>
                    Verified line · {quote.market}
                    <small>Captured {quote.captured_at.replace("T", " ").replace("Z", " UTC").slice(0, 22)} · updated {quote.updated_at.replace("T", " ").replace("Z", " UTC").slice(0, 22)}</small>
                    {comparisonGapLabel(quote) && <small className={`market-gap-${comparisonGapDirection(quote)}`}>Model gap · {comparisonGapLabel(quote)}</small>}
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
              <small className="factor-source">Pregame quotes are displayed only when the ledger matched the exact game record and captured them before tip. They are market observations, not recommendations.</small>
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
        <br />
        {coldStart ? "Cold-start estimate · " : "Preseason baseline · "}
        roster changes are not model features.
        <br />
        {marketQuotes.length ? "" : "No verified pregame market line imported. "}
        <Link href="/research/scorecard/?sport=basketball">
          Check the forecast record →
        </Link>
      </p>
      {p && (
        <div className="button-row">
          <Link className="note" href={`/blog/basketball-game-${encodeURIComponent(g.id)}/`}>
            Open game notebook →
          </Link>
          <Link className="note" href={`/basketball/briefs/${encodeURIComponent(g.id)}/`}>
            Brief ↗
          </Link>
        </div>
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
  modelId,
  sameEdition,
}: {
  factors: NonNullable<BBGame["matchup_factors"]>;
  homeName: string;
  awayName: string;
  modelId?: string | null;
  sameEdition: boolean;
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
        <strong>{sameEdition ? "Why the model tilts" : "Why this matchup is worth studying"}</strong>
        <span className="muted">{sameEdition ? "four-factor edge" : "descriptive context"}</span>
      </div>
      {!sameEdition && <small className="status-warn">These rates come from context edition {modelId || "unavailable"}; they did not generate this forecast and are not counted as same-edition evidence.</small>}
      <small className="factor-source">
        {sameEdition ? "Use the largest contrast to choose the first film question." : "Use this retained contrast as a study prompt; it is separate from the forecast edition."} {" "}
        <Link href="/basketball/learn/#four-factors">Learn how to read Four Factors →</Link>
      </small>
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
            <br />
            <strong>Study:</strong> {matchupFactorStudyQuestion(row.key)}
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

function rosterMinutes(value: number | null | undefined) {
  return value == null ? "—" : `${Math.round(value).toLocaleString()} min`;
}
