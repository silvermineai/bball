import Link from "next/link";
import type { FootballEfficiencyScenario, Game, Overview } from "../_lib/data";
import type { FootballCardIntel } from "../_lib/football-brief";
import { exactFootballCalibrationReliability, footballModelFactors, type FootballReliabilityBand } from "../_lib/football-model-factors";
import { date, fmt, kick } from "../_lib/format";
import { comparisonGapDirection, comparisonGapLabel } from "../_lib/market-display";
import type { FootballRecruitingTeam } from "../_lib/football-recruiting-context";
import { footballMatchupContextEdgeLabel, footballMatchupContextRows, type FootballMatchupContextRow } from "../_lib/football-matchup-context";
import { footballPersonnelReadinessRows, personnelReadinessStatusLabel, type FootballPersonnelReadinessGame } from "../_lib/football-personnel-readiness";
import { footballForecastAvailability, footballForecastEvidence } from "../_lib/football-forecast-evidence";
const categoryLabel: Record<string, string> = {
  passing: "Pass",
  rushing: "Rush",
  receiving: "Receive",
};
const efficiencyFeatureLabels: Record<string, string> = {
  base_margin: "Score-model margin",
  home_off_epa_minus_away_off_epa: "Offensive EPA/play gap",
  home_def_epa_minus_away_def_epa: "Defensive EPA/play gap",
  home_off_ypp_minus_away_off_ypp: "Offensive yards/play gap",
  home_def_ypp_minus_away_def_ypp: "Defensive yards/play gap",
};
function contextValue(row: FootballMatchupContextRow, value: number | null) {
  if (value == null) return "—";
  if (row.format === "rank") return `#${fmt(value, 0)}`;
  if (row.format === "percent") return `${fmt(value * 100, 1)}%`;
  return fmt(value, 1);
}
export default function MatchCard({
  game: g,
  efficiencyScenario,
  intel,
  recruiting,
  personnelReadiness,
  model,
  calibrationReliability,
  expectedModelId,
}: {
  game: Game;
  efficiencyScenario?: FootballEfficiencyScenario;
  intel?: FootballCardIntel;
  recruiting?: { home?: FootballRecruitingTeam; away?: FootballRecruitingTeam };
  personnelReadiness?: FootballPersonnelReadinessGame;
  model?: Pick<Overview["model"], "teams" | "margin_coef" | "total_coef">;
  calibrationReliability?: FootballReliabilityBand[];
  expectedModelId?: string | null;
}) {
  const p = g.prediction;
  const modelFactors = p && model ? footballModelFactors(model, g) : null;
  const reliability = p ? exactFootballCalibrationReliability(p, calibrationReliability, expectedModelId) : null;
  const forecastEvidence = footballForecastEvidence(g, model, expectedModelId);
  const forecastAvailability = footballForecastAvailability(g, model?.teams);
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
          <div className="forecast-confidence-panel" aria-label="Held-out probability calibration context">
            <div className="forecast-confidence-heading">
              <strong>Held-out calibration context</strong>
              <span>{reliability ? `${reliability.games.toLocaleString()} games` : "Unavailable"}</span>
            </div>
            {reliability ? (
              <div className="forecast-confidence-values">
                <span><b>{reliability.side}</b> {fmt(reliability.confidence_lower * 100, 0)}–{fmt(reliability.confidence_upper * 100, 0)}% probability band</span>
                <span>{reliability.observed == null ? "—" : `${fmt(reliability.observed * 100, 1)}%`} observed win rate</span>
              </div>
            ) : <p className="note">No populated held-out reliability bin matches this probability.</p>}
            {reliability && <small>Historical holdout context for the model&apos;s probability band; it is not a guarantee for this game.{reliability.observed_gap_pp == null ? " Observed rate unavailable." : ` Observed minus binned predicted rate: ${reliability.observed_gap_pp >= 0 ? "+" : ""}${fmt(reliability.observed_gap_pp, 1)} percentage points.`}</small>}
          </div>
          <small className="factor-source">
            Model edition <code>{p.model_id || "unlabeled"}</code>
            {p.generated_at ? ` · registered ${date(p.generated_at)}` : " · registration clock unavailable"}
          </small>
          <div className={`forecast-integrity forecast-integrity-${forecastEvidence.state}`} role="status">
            <strong>{forecastEvidence.state === "verified" ? "Forecast record verified" : forecastEvidence.state === "review" ? "Forecast record needs review" : "Forecast unavailable"}</strong>
            <small>{forecastEvidence.division ? `Exact ${forecastEvidence.division.toUpperCase()} scope` : "Division scope unresolved"}{forecastEvidence.reconstruction ? ` · coefficients reconcile within ${Math.max(Math.abs(forecastEvidence.reconstruction.margin_delta), Math.abs(forecastEvidence.reconstruction.total_delta)).toFixed(2)} pts` : ""}</small>
            {forecastEvidence.reasons.length > 0 && <small>{forecastEvidence.reasons.join(" · ")}</small>}
          </div>
          <details className="forecast-factor-disclosure">
            <summary>Explain estimate</summary>
            {modelFactors ? <dl className="raw-stat-grid">
              <div><dt>Margin components</dt><dd>{fmt(modelFactors.margin.intercept)} intercept · {modelFactors.margin.venue >= 0 ? "+" : ""}{fmt(modelFactors.margin.venue)} venue · {modelFactors.margin.home_team >= 0 ? "+" : ""}{fmt(modelFactors.margin.home_team)} home · {modelFactors.margin.away_team >= 0 ? "+" : ""}{fmt(modelFactors.margin.away_team)} away</dd></div>
              <div><dt>Margin estimate</dt><dd>{modelFactors.margin.estimate >= 0 ? "+" : ""}{fmt(modelFactors.margin.estimate)} points</dd></div>
              <div><dt>Total components</dt><dd>{fmt(modelFactors.total.intercept)} intercept · {modelFactors.total.venue >= 0 ? "+" : ""}{fmt(modelFactors.total.venue)} venue · {modelFactors.total.home_team >= 0 ? "+" : ""}{fmt(modelFactors.total.home_team)} home · {modelFactors.total.away_team >= 0 ? "+" : ""}{fmt(modelFactors.total.away_team)} away</dd></div>
              <div><dt>Total estimate</dt><dd>{fmt(modelFactors.total.estimate)} points</dd></div>
            </dl> : <p className="note">Registered coefficients are unavailable for this matchup, so the component terms are withheld.</p>}
            <small className="factor-source">These terms reconstruct the registered score model for this exact matchup. They are model components, not independent forecasts or player availability claims.</small>
          </details>
        </>
      ) : (
        <p className="note">
          <strong>{forecastAvailability.label}</strong><br />
          {forecastAvailability.detail} Schedule retained for planning.
        </p>
      )}
      {intel && intel.programs.some((program) => program.leaders.length) && (
        <section className="football-card-intel" aria-label={`${intel.playerSeason} player production to review`}>
          <div className="football-card-intel-heading">
            <strong>Personnel to review</strong>
            <span>{intel.playerSeason} retained production</span>
          </div>
          <div className="football-card-intel-grid">
            {intel.programs.map((program) => (
              <div key={program.id}>
                <h4>{program.name}</h4>
                {program.leaders.length ? (
                  <ul>
                    {program.leaders.map((leader) => (
                      <li key={`${leader.category}-${leader.id}`}>
                        <Link href={`/football/player/?id=${encodeURIComponent(leader.id)}&season=${intel.playerSeason}`}>
                          {leader.name}
                        </Link>
                        <small>{categoryLabel[leader.category] || leader.category} · {fmt(leader.epaPerPlay, 2)} EPA/play · {leader.plays.toLocaleString()} plays</small>
                      </li>
                    ))}
                  </ul>
                ) : <p>No qualified category leader.</p>}
              </div>
            ))}
          </div>
          <small className="football-card-intel-note">
            Prior-season source affiliation; this does not verify the current roster or availability.
          </small>
        </section>
      )}
      {recruiting && (recruiting.home || recruiting.away) && (
        <section className="football-card-intel" aria-label="Recruiting and returning production context">
          <div className="football-card-intel-heading">
            <strong>Personnel context</strong>
            <span>Retained team-level recruiting edition</span>
          </div>
          <div className="table-scroll">
            <table className="data-table matchup-context-table">
              <thead><tr><th>Measure</th><th>{recruiting.away?.team || "Away"}<small>Team ID {recruiting.away?.team_id || "unavailable"}</small></th><th>{recruiting.home?.team || "Home"}<small>Team ID {recruiting.home?.team_id || "unavailable"}</small></th><th>Read</th></tr></thead>
              <tbody>{footballMatchupContextRows(recruiting.away, recruiting.home).map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}<small>{row.direction === "lower" ? "Lower is stronger" : "Higher is stronger"}</small></th>
                  <td className="numeric">{contextValue(row, row.away)}</td>
                  <td className="numeric">{contextValue(row, row.home)}</td>
                  <td>{footballMatchupContextEdgeLabel(row)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <small className="football-card-intel-note">Personnel context is descriptive and season-scoped; it does not alter the primary forecast or establish eligibility, availability or starting roles. Returning fields retain their reported or estimated status in the recruiting desk.</small>
        </section>
      )}
      {personnelReadiness && (
        <section className="football-card-intel" aria-label="Football personnel feature readiness">
          <div className="football-card-intel-heading">
            <strong>Personnel feature readiness</strong>
            <span>{personnelReadinessStatusLabel(personnelReadiness.status)} · exact IDs</span>
          </div>
          <p className="note" style={{ margin: "0 0 10px" }}>
            Source-backed team context for this forecast record. It is research evidence only and does not change the primary estimate.
          </p>
          <div className="table-scroll">
            <table className="data-table matchup-context-table">
              <thead><tr><th>Measure</th><th>{personnelReadiness.away_name || "Away"}<small>Team ID {personnelReadiness.away_id}</small></th><th>{personnelReadiness.home_name || "Home"}<small>Team ID {personnelReadiness.home_id}</small></th><th>Read</th></tr></thead>
              <tbody>{footballPersonnelReadinessRows(personnelReadiness).map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}<small>{row.direction === "lower" ? "Lower is stronger" : "Higher is stronger"}</small></th>
                  <td className="numeric">{contextValue(row, row.away)}</td>
                  <td className="numeric">{contextValue(row, row.home)}</td>
                  <td>{footballMatchupContextEdgeLabel(row)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <small className="football-card-intel-note">
            {personnelReadiness.status === "complete" ? "All six retained fields are present for both sides. " : "Missing fields remain unavailable; they are never treated as zero. "}
            {personnelReadiness.status === "conflict" ? `Conflicting fields: ${[...new Set([...personnelReadiness.home.conflicting_fields, ...personnelReadiness.away.conflicting_fields])].join(", ") || "unreported"}. ` : ""}
            Sources: {[...new Set([...personnelReadiness.home.source_datasets, ...personnelReadiness.away.source_datasets])].join(", ") || "unavailable"}. The release remains outside the primary model pending dated validation.
          </small>
        </section>
      )}
      {efficiencyScenario && (
        <div className="market-note">
          <strong>Efficiency challenger · research-only</strong><br />
          Margin {fmt(efficiencyScenario.challenger_margin)} · shift {efficiencyScenario.margin_delta > 0 ? "+" : ""}{fmt(efficiencyScenario.margin_delta)} pts
          <br />
          Advanced lagged rates do not change the primary probability, range or ledger.
          {efficiencyScenario.feature_contributions?.length ? (
            <details className="forecast-factor-disclosure" style={{ marginTop: 10 }}>
              <summary>Show challenger evidence</summary>
              <p className="factor-source">Each term is from the retained team advanced game rows used by the dated residual model. State <code>{efficiencyScenario.feature_state_id || "unlabeled"}</code>.</p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Feature</th><th className="numeric">Observed gap</th><th className="numeric">Margin contribution</th></tr></thead>
                  <tbody>{efficiencyScenario.feature_contributions
                    .slice()
                    .sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution))
                    .map((feature) => (
                      <tr key={feature.key}>
                        <th scope="row">{efficiencyFeatureLabels[feature.key] || feature.key}</th>
                        <td className="numeric">{fmt(feature.value, 3)}</td>
                        <td className="numeric">{feature.contribution >= 0 ? "+" : ""}{fmt(feature.contribution, 2)}</td>
                      </tr>
                    ))}</tbody>
                </table>
              </div>
            </details>
          ) : null}
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
                Verified line · {quote.market}
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
        <div className="button-row football-card-actions">
          <Link className="note" href={`/blog/game-${g.id}/`}>
            Read the matchup brief →
          </Link>
          <Link className="note" href={`/research/game/?sport=football&id=${encodeURIComponent(g.id)}`}>
            Forecast record ↗
          </Link>
        </div>
      )}
    </article>
  );
}
