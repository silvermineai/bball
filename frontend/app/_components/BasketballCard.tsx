import Link from "next/link";
import type {
  BBFactorKey,
  BBGame,
  BBOverview,
  BBRosterScenario,
  BBRosterSummary,
  BBTeam,
} from "../_lib/basketball-types";
import { date, fmt, kick } from "../_lib/format";
import { comparisonGapDirection, comparisonGapDirectionLabel, comparisonGapLabel } from "../_lib/market-display";
import { forecastConfidenceSummary, forecastEvidenceCoverage, forecastEvidenceDetail, forecastEvidenceLabel, forecastIntegrity, forecastModelEvidence, forecastSignalContext, forecastUnknownTeams, matchupFactorStudyQuestion, strongestMatchupSignal } from "../_lib/forecast-lab-analysis";
import { latestForecastLabMarketQuote } from "../_lib/forecast-lab-market";
import { resolveForecastEdition } from "../_lib/forecast-edition";
import { explainBasketballPrediction, publishedScoreArithmetic } from "../_lib/basketball-prediction-explanation";
import { exactBasketballCalibrationContext, type BasketballCalibrationBucket } from "../_lib/basketball-calibration";
import { matchupPaceLens } from "../_lib/basketball-pace-lens";
import { isUsableBasketballPrediction } from "../_lib/basketball-matchups";
import RotationWatchPanel from "./RotationWatchPanel";

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
  model,
  calibrationBuckets,
  calibrationModelId,
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
  model?: Pick<BBOverview["model"], "id" | "teams" | "efficiency" | "tempo" | "evaluation"> | null;
  calibrationBuckets?: readonly BasketballCalibrationBucket[];
  calibrationModelId?: string | null;
}) {
  const primaryPrediction = isUsableBasketballPrediction(g.prediction) ? g.prediction : null;
  const fallbackPrediction = isUsableBasketballPrediction(g.fallback_prediction) ? g.fallback_prediction : null;
  const p = primaryPrediction || fallbackPrediction;
  const forecastEdition = resolveForecastEdition(g, {
    modelId: forecastModelId,
    generatedAt: forecastCreatedAt,
  });
  const modelEvidence = model ? forecastModelEvidence(model, forecastEdition.modelId) : null;
  const coldStart = !primaryPrediction && !!fallbackPrediction;
  const scoreExplanation = p ? explainBasketballPrediction(model, g, p) : null;
  const publishedArithmetic = p ? publishedScoreArithmetic(p) : null;
  const calibrationContext = p && !coldStart
    ? exactBasketballCalibrationContext(
      p.home_win_probability,
      calibrationBuckets,
      forecastEdition.modelId,
      calibrationModelId,
    )
    : null;
  const paceLens = matchupPaceLens(p, homeRating, awayRating);
  const signalContext = forecastSignalContext(p, !!primaryPrediction);
  const confidence = forecastConfidenceSummary(p, !!primaryPrediction);
  const strongestFactor = strongestMatchupSignal(g.matchup_factors, g.matchup_factors_same_edition !== false);
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
    primary: !!primaryPrediction,
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
          <div className={`forecast-confidence-panel ${confidence.estimate === "unavailable" ? "is-unavailable" : ""}`} aria-label="Model confidence context">
            <div className="forecast-confidence-heading">
              <strong>Model confidence context</strong>
              <span>{confidence.label}</span>
            </div>
            <div className="forecast-confidence-values">
              <span><b>{confidence.strongest_side}</b> {confidence.strongest_probability == null ? "—" : `${fmt(confidence.strongest_probability * 100, 1)}%`} strongest-side probability</span>
              <span>{confidence.range_width == null ? "—" : `${fmt(confidence.range_width, 1)} pts`} range width</span>
            </div>
            <small>{confidence.range_context}. The probability and range are from forecast edition <span className="mono">{forecastEdition.modelId || "unavailable"}</span>; this context does not include a market quote.</small>
          </div>
          {calibrationContext && (
            <div className="forecast-confidence-panel forecast-calibration-context" aria-label="Exact-edition held-out calibration context">
              <div className="forecast-confidence-heading">
                <strong>Held-out calibration context</strong>
                <span>{calibrationContext.side} {fmt(calibrationContext.confidence_lower * 100, 0)}–{fmt(calibrationContext.confidence_upper * 100, 0)}%</span>
              </div>
              <div className="forecast-confidence-values">
                <span><b>{fmt(calibrationContext.observed! * 100, 1)}%</b> observed win rate</span>
                <span>{calibrationContext.games.toLocaleString()} held-out games</span>
                <span>{calibrationContext.observed_gap_pp == null ? "—" : `${calibrationContext.observed_gap_pp >= 0 ? "+" : ""}${fmt(calibrationContext.observed_gap_pp, 1)} pp vs model`}</span>
              </div>
              <small>Historical replay for the exact forecast edition. The observed rate describes this probability band; it is not a guarantee for this game.</small>
            </div>
          )}
          {modelEvidence && (
            <details className="match-card-details model-track-record">
              <summary>Model track record</summary>
              {modelEvidence.state === "matched" ? (
                <>
                  <p className="factor-source">
                    Historical holdout evidence for the exact forecast edition attached to this row. These metrics describe the test set; they do not guarantee this game&apos;s result.
                  </p>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead><tr><th>Holdout evidence</th><th className="numeric">Value</th></tr></thead>
                      <tbody>
                        <tr><th scope="row">Games tested</th><td className="numeric">{modelEvidence.games?.toLocaleString() || "—"}</td></tr>
                        <tr><th scope="row">Winner accuracy</th><td className="numeric">{modelEvidence.winnerAccuracy == null ? "—" : `${fmt(modelEvidence.winnerAccuracy * 100, 1)}%`}</td></tr>
                        <tr><th scope="row">Margin error</th><td className="numeric">{modelEvidence.marginMae == null ? "—" : `${fmt(modelEvidence.marginMae, 2)} pts MAE`}</td></tr>
                        <tr><th scope="row">80% margin band coverage</th><td className="numeric">{modelEvidence.intervalCoverage == null ? "—" : `${fmt(modelEvidence.intervalCoverage * 100, 1)}%`}</td></tr>
                        {modelEvidence.improvementVsBaseline != null && <tr><th scope="row">Margin MAE vs baseline</th><td className="numeric">{modelEvidence.improvementVsBaseline >= 0 ? "−" : "+"}{fmt(Math.abs(modelEvidence.improvementVsBaseline), 2)} pts</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <small className="factor-source">Holdout season ending {modelEvidence.holdoutSeason} · edition <span className="mono">{modelEvidence.modelId}</span>. Lower margin error is better.</small>
                </>
              ) : modelEvidence.state === "mismatch" ? (
                <p className="status-warn">The bundled holdout record is for edition <span className="mono">{modelEvidence.modelId}</span>, while this forecast row is from <span className="mono">{modelEvidence.forecastModelId}</span>. Historical metrics are withheld until the exact evaluation edition is available.</p>
              ) : (
                <p className="note">The exact forecast edition does not have a complete, validated holdout record attached. Historical performance stays unavailable rather than being borrowed from another edition.</p>
              )}
            </details>
          )}
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
          {paceLens && (
            <div className="pace-lens" aria-label="Tempo game script">
              <div className="match-detail">
                <strong>Tempo game script</strong>
                <span className="muted">
                  {paceLens.environment === "faster"
                    ? "faster than prior baseline"
                    : paceLens.environment === "slower"
                      ? "slower than prior baseline"
                      : "near prior baseline"}
                </span>
              </div>
              <div className="match-detail muted">
                <span>Prior adjusted tempo · H / A</span>
                <span>{fmt(paceLens.prior_home, 1)} / {fmt(paceLens.prior_away, 1)}</span>
              </div>
              <div className="match-detail muted">
                <span>Forecast vs prior mean</span>
                <span>{paceLens.projected_delta >= 0 ? "+" : ""}{fmt(paceLens.projected_delta, 1)} possessions</span>
              </div>
              <small>
                {paceLens.faster_team === "even"
                  ? "Both teams carried nearly the same prior adjusted tempo."
                  : `${paceLens.faster_team === "home" ? g.home_name : g.away_name} carried the faster prior adjusted tempo by ${fmt(Math.abs(paceLens.tempo_gap), 1)} possessions.`} Historical exact-ID tempo context is descriptive and does not alter this forecast.
              </small>
            </div>
          )}
          <div className="match-detail muted">
            <span>Projected efficiency · A / H</span>
            <span>{p.away_efficiency == null || p.home_efficiency == null ? "—" : `${fmt(p.away_efficiency, 1)} / ${fmt(p.home_efficiency, 1)} pts per 100`}</span>
          </div>
          {(scoreExplanation || publishedArithmetic) && (
            <details className="match-card-details matchup-model-equation">
              <summary>How the model got there</summary>
              {scoreExplanation ? <>
                <p className="factor-source">
                  Exact coefficient reconstruction for this forecast edition. Each term is points per 100 possessions; score equals projected efficiency × pace ÷ 100.
                </p>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr><th>Term</th><th className="numeric">{scoreExplanation.away.team}</th><th className="numeric">{scoreExplanation.home.team}</th></tr>
                    </thead>
                    <tbody>
                      <tr><th scope="row">League baseline</th><td className="numeric">{fmt(scoreExplanation.away.league, 2)}</td><td className="numeric">{fmt(scoreExplanation.home.league, 2)}</td></tr>
                      <tr><th scope="row">Own offense effect</th><td className="numeric">{scoreExplanation.away.ownOffense >= 0 ? "+" : ""}{fmt(scoreExplanation.away.ownOffense, 2)}</td><td className="numeric">{scoreExplanation.home.ownOffense >= 0 ? "+" : ""}{fmt(scoreExplanation.home.ownOffense, 2)}</td></tr>
                      <tr><th scope="row">Opponent defense effect</th><td className="numeric">{scoreExplanation.away.opponentDefense >= 0 ? "+" : ""}{fmt(scoreExplanation.away.opponentDefense, 2)}</td><td className="numeric">{scoreExplanation.home.opponentDefense >= 0 ? "+" : ""}{fmt(scoreExplanation.home.opponentDefense, 2)}</td></tr>
                      <tr><th scope="row">Venue effect</th><td className="numeric">{scoreExplanation.away.venue >= 0 ? "+" : ""}{fmt(scoreExplanation.away.venue, 2)}</td><td className="numeric">{scoreExplanation.home.venue >= 0 ? "+" : ""}{fmt(scoreExplanation.home.venue, 2)}</td></tr>
                      <tr><th scope="row"><strong>Projected efficiency</strong></th><td className="numeric"><strong>{fmt(scoreExplanation.away.efficiency, 2)}</strong></td><td className="numeric"><strong>{fmt(scoreExplanation.home.efficiency, 2)}</strong></td></tr>
                      <tr><th scope="row">Projected pace</th><td className="numeric">{fmt(scoreExplanation.paceBaseline, 2)}</td><td className="numeric">{fmt(scoreExplanation.paceBaseline, 2)}</td></tr>
                      <tr><th scope="row"><strong>Score from equation</strong></th><td className="numeric"><strong>{fmt(scoreExplanation.away.projectedScore, 2)}</strong></td><td className="numeric"><strong>{fmt(scoreExplanation.home.projectedScore, 2)}</strong></td></tr>
                    </tbody>
                  </table>
                </div>
                <small className="factor-source">A missing or edition-mismatched coefficient set suppresses this reconstruction rather than showing stale arithmetic.</small>
              </> : <>
                <p className="factor-source">
                  The live forecast edition does not expose its coefficient terms in the browser bundle. The published score arithmetic still reconciles exactly from the live row&apos;s efficiency and pace fields.
                </p>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead><tr><th>Published field</th><th className="numeric">{g.away_name}</th><th className="numeric">{g.home_name}</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Projected efficiency</th><td className="numeric">{fmt(publishedArithmetic!.awayEfficiency, 2)}</td><td className="numeric">{fmt(publishedArithmetic!.homeEfficiency, 2)}</td></tr>
                      <tr><th scope="row">Projected pace</th><td className="numeric">{fmt(publishedArithmetic!.pace, 2)}</td><td className="numeric">{fmt(publishedArithmetic!.pace, 2)}</td></tr>
                      <tr><th scope="row"><strong>Efficiency × pace ÷ 100</strong></th><td className="numeric"><strong>{fmt(publishedArithmetic!.awayScore, 2)}</strong></td><td className="numeric"><strong>{fmt(publishedArithmetic!.homeScore, 2)}</strong></td></tr>
                    </tbody>
                  </table>
                </div>
                <small className="factor-source">This is a reconciliation of published model fields, not a new forecast or a substitute for the registered coefficient artifact.</small>
              </>}
            </details>
          )}
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
              <RotationWatchPanel scenario={rosterScenario} awayName={g.away_name} homeName={g.home_name} />
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
                    {comparisonGapDirectionLabel(quote) && <small>{comparisonGapDirectionLabel(quote)}</small>}
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
