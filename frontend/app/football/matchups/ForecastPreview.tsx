"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Game, Overview } from "../../_lib/data";
import { filterFootballMatchupGames, parseFootballMatchupDivision } from "../../_lib/football-matchup-view";
import { footballCalibrationSummary, footballModelFactors, type FootballModelCalibration } from "../../_lib/football-model-factors";
import { fmt, kick, signed } from "../../_lib/format";

type Props = {
  games: Game[];
  model: Pick<Overview["model"], "teams" | "margin_coef" | "total_coef"> & { calibration?: FootballModelCalibration };
};

/**
 * The site is a static export, so the HTML build cannot see query parameters.
 * Keep the compact forecast board empty until the browser resolves the active
 * division; otherwise a D2/D3 URL briefly exposes the D1 preview.
 */
export default function ForecastPreview({ games, model }: Props) {
  const params = useSearchParams();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const division = parseFootballMatchupDivision(params.get("division"));
  const forecastPreview = useMemo(
    () => filterFootballMatchupGames(games, division).filter((game) => game.prediction).slice(0, 20),
    [division, games],
  );
  const divisionLabel = division === "d1" ? "D1 · FBS/FCS" : division.toUpperCase();

  return (
    <section className="paper-panel" aria-labelledby="football-forecast-board" style={{ marginBottom: 24 }}>
      <div className="section-heading" style={{ marginBottom: 12 }}>
        <div>
          <div className="eyebrow">Silvermine forecast board / 2026 · {divisionLabel}</div>
          <h2 id="football-forecast-board">Upcoming games, already modeled</h2>
        </div>
        <span className="note">First 20 published forecasts · newest edition</span>
      </div>
      {!hydrated ? <p className="empty" role="status" aria-busy="true">Resolving the requested division…</p> : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Start</th><th>Away</th><th>Home</th><th className="numeric">Away pts</th><th className="numeric">Home pts</th><th className="numeric">Home win%</th><th className="numeric">Margin</th><th className="numeric">Total</th><th>Estimate</th></tr></thead>
              <tbody>{forecastPreview.map((game) => {
                const prediction = game.prediction;
                return <tr key={game.id}>
                  <td>{kick(game.kickoff)}</td>
                  <td><Link href={`/football/matchups/?team=${encodeURIComponent(game.away_name)}&division=${division === "d1" ? "1" : division.slice(1)}`}>{game.away_name}</Link></td>
                  <td><Link href={`/football/matchups/?team=${encodeURIComponent(game.home_name)}&division=${division === "d1" ? "1" : division.slice(1)}`}>{game.home_name}</Link></td>
                  <td className="numeric">{fmt(prediction?.away_score)}</td>
                  <td className="numeric"><strong>{fmt(prediction?.home_score)}</strong></td>
                  <td className="numeric">{prediction?.home_win_probability == null ? "—" : `${fmt(prediction.home_win_probability * 100)}%`}</td>
                  <td className="numeric">{fmt(prediction?.home_margin)}</td>
                  <td className="numeric">{fmt(prediction?.total)}</td>
                  <td>
                    <strong>Primary</strong>
                    <small>{prediction?.margin_low == null || prediction.margin_high == null ? "Range unavailable" : `Range ${fmt(prediction.margin_low)} to ${fmt(prediction.margin_high)}`}</small>
                    {prediction && (() => {
                      const factors = footballModelFactors(model, game);
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
          {!forecastPreview.length && <p className="empty">No published forecasts are available for the requested division.</p>}
        </>
      )}
      <p className="note" style={{ marginTop: 12 }}>Scores, win probability, margin, total and the calibrated range come from the registered Silvermine model edition. Open the desk below to filter the full slate and compare qualifying market observations.</p>
      {footballCalibrationSummary(model.calibration) && <p className="note" style={{ marginTop: 8 }}>{footballCalibrationSummary(model.calibration)}</p>}
    </section>
  );
}
