import { Suspense } from "react";
import Link from "next/link";
import { getFootballEfficiencyModel, getOverview } from "../../_lib/data";
import { fmt, kick, signed } from "../../_lib/format";
import { getFootballBriefEvidence } from "../../_lib/football-brief-data";
import { footballSlateIntel } from "../../_lib/football-brief";
import MatchupBrowser from "./MatchupBrowser";
import { footballModelFactors } from "../../_lib/football-model-factors";
import LowerDivisionResults from "./LowerDivisionResults";
export const metadata = { title: "2026 football matchups and forecasts" };
export default function Page() {
  const d = getOverview();
  const efficiencyModel = getFootballEfficiencyModel();
  const forecastPreview = d.upcoming.filter((game) => game.prediction).slice(0, 20);
  const matchupIntel = footballSlateIntel(
    d.upcoming.map((game) => getFootballBriefEvidence(game)),
  );
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The next possession starts here</div>
        <h1>The matchup desk.</h1>
        <p>
          Every published upcoming game in the retained FBS, FCS, Division II
          and Division III schedule. Forecasts cover known FBS opponents and
          validated exact-division D2/D3 games, with score estimates and an 80%
          margin range; rows without a validated model remain visible. All times Eastern; schedules
          can change.
        </p>
      </div>
      <section className="paper-panel" aria-labelledby="football-forecast-board" style={{ marginBottom: 24 }}>
        <div className="section-heading" style={{ marginBottom: 12 }}>
          <div>
            <div className="eyebrow">Silvermine forecast board / 2026</div>
            <h2 id="football-forecast-board">Upcoming games, already modeled</h2>
          </div>
          <span className="note">First 20 published forecasts · newest edition</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Start</th><th>Away</th><th>Home</th><th className="numeric">Away pts</th><th className="numeric">Home pts</th><th className="numeric">Home win%</th><th className="numeric">Margin</th><th className="numeric">Total</th><th>Estimate</th></tr></thead>
            <tbody>{forecastPreview.map((game) => {
              const prediction = game.prediction;
              return <tr key={game.id}>
                <td>{kick(game.kickoff)}</td>
                <td><Link href={`/football/matchups/?team=${encodeURIComponent(game.away_name)}`}>{game.away_name}</Link></td>
                <td><Link href={`/football/matchups/?team=${encodeURIComponent(game.home_name)}`}>{game.home_name}</Link></td>
                <td className="numeric">{fmt(prediction?.away_score)}</td>
                <td className="numeric"><strong>{fmt(prediction?.home_score)}</strong></td>
                <td className="numeric">{prediction?.home_win_probability == null ? "—" : `${fmt(prediction.home_win_probability * 100)}%`}</td>
                <td className="numeric">{fmt(prediction?.home_margin)}</td>
                <td className="numeric">{fmt(prediction?.total)}</td>
                <td>
                  <strong>Primary</strong>
                  <small>{prediction?.margin_low == null || prediction.margin_high == null ? "Range unavailable" : `Range ${fmt(prediction.margin_low)} to ${fmt(prediction.margin_high)}`}</small>
                  {prediction && (() => {
                    const factors = footballModelFactors(d.model, game);
                    return <details className="forecast-factor-disclosure">
                      <summary>Explain estimate</summary>
                      {factors ? <dl className="raw-stat-grid">
                        <div><dt>Margin components</dt><dd>{signed(factors.margin.intercept)} intercept · {signed(factors.margin.venue)} venue · {signed(factors.margin.home_team)} home · {signed(factors.margin.away_team)} away</dd></div>
                        <div><dt>Raw margin</dt><dd>{signed(factors.margin.estimate)}</dd></div>
                        <div><dt>Total components</dt><dd>{signed(factors.total.intercept)} intercept · {signed(factors.total.venue)} venue · {signed(factors.total.home_team)} home · {signed(factors.total.away_team)} away</dd></div>
                        <div><dt>Raw total</dt><dd>{fmt(factors.total.estimate)}</dd></div>
                      </dl> : <p className="note">Registered coefficients unavailable for this game.</p>}
                    </details>;
                  })()}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {!forecastPreview.length && <p className="empty">No published forecasts are available for the upcoming slate.</p>}
        <p className="note" style={{ marginTop: 12 }}>Scores, win probability, margin, total and the calibrated range come from the registered Silvermine model edition. Open the desk below to filter the full slate and compare qualifying market observations.</p>
      </section>
      <Suspense fallback={<p>Loading matchups…</p>}>
        <MatchupBrowser
          games={d.upcoming}
          generated={d.generated_at}
          efficiencyScenarios={efficiencyModel.scenarios}
          matchupIntel={matchupIntel}
          modelId={d.model.id}
          model={d.model}
          marketCoverage={{
            market_observations: d.coverage.market_observations,
            pregame_market_observations: d.coverage.pregame_market_observations,
          }}
        />
      </Suspense>
      <LowerDivisionResults />
    </>
  );
}
