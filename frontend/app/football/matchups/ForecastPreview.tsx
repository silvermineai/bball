"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Game, Overview } from "../../_lib/data";
import { filterFootballMatchupGames, parseFootballMatchupDivision } from "../../_lib/football-matchup-view";
import { footballCalibrationReliabilityForDivision, footballCalibrationSummary, footballModelFactors, type FootballModelCalibration, type FootballReliabilityBand } from "../../_lib/football-model-factors";
import { loadLiveFootballForecasts, loadLiveFootballModelReliability, mergeLiveFootballForecasts } from "../../_lib/live-football-forecasts";
import { fmt, kick, signed } from "../../_lib/format";

type Props = {
  games: Game[];
  model: Pick<Overview["model"], "id" | "teams" | "margin_coef" | "total_coef"> & {
    calibration?: FootballModelCalibration;
    evaluation?: { reliability?: FootballReliabilityBand[] };
  };
};

/**
 * The site is a static export, so the HTML build cannot see query parameters.
 * Keep the compact forecast board empty until the browser resolves the active
 * division; otherwise a D2/D3 URL briefly exposes the D1 preview.
 */
export default function ForecastPreview({ games, model }: Props) {
  const params = useSearchParams();
  const [hydrated, setHydrated] = useState(false);
  const [liveGames, setLiveGames] = useState<Game[] | null>(null);
  const [liveModelId, setLiveModelId] = useState<string | null>(null);
  const [liveReliability, setLiveReliability] = useState<FootballReliabilityBand[] | null>(null);
  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    const controller = new AbortController();
    loadLiveFootballForecasts(controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        const modelId = rows.find((row) => row.model_id)?.model_id || null;
        setLiveGames(mergeLiveFootballForecasts(games, rows));
        setLiveModelId(modelId);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLiveGames(null);
          setLiveModelId(null);
        }
      });
    return () => controller.abort();
  }, [games]);
  useEffect(() => {
    if (!liveModelId) {
      setLiveReliability(null);
      return;
    }
    const controller = new AbortController();
    setLiveReliability(null);
    loadLiveFootballModelReliability(controller.signal, liveModelId)
      .then((summary) => {
        if (!controller.signal.aborted && summary.modelId === liveModelId) setLiveReliability(summary.reliability);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLiveReliability(null);
      });
    return () => controller.abort();
  }, [liveModelId]);
  const division = parseFootballMatchupDivision(params.get("division"));
  const activeGames = liveGames || games;
  const forecastPreview = useMemo(
    () => filterFootballMatchupGames(activeGames, division).filter((game) => game.prediction).slice(0, 20),
    [activeGames, division],
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
              <thead><tr><th>Start</th><th>Away</th><th>Home</th><th className="numeric">Away pts</th><th className="numeric">Home pts</th><th className="numeric">Home win%</th><th>Held-out context</th><th className="numeric">Margin</th><th className="numeric">Total</th><th>Estimate</th></tr></thead>
              <tbody>{forecastPreview.map((game) => {
                const prediction = game.prediction;
                // The holdout bins are from the D1 model edition. Never carry
                // that calibration context into an exact-division lower-
                // division forecast if one is added to the schedule later.
                const reliability = prediction && division === "d1"
                  ? footballCalibrationReliabilityForDivision(prediction.home_win_probability, liveModelId ? liveReliability : model.evaluation?.reliability, division)
                  : null;
                return <tr key={game.id}>
                  <td>{kick(game.kickoff)}</td>
                  <td><Link href={`/football/matchups/?team=${encodeURIComponent(game.away_name)}&division=${division === "d1" ? "1" : division.slice(1)}`}>{game.away_name}</Link></td>
                  <td><Link href={`/football/matchups/?team=${encodeURIComponent(game.home_name)}&division=${division === "d1" ? "1" : division.slice(1)}`}>{game.home_name}</Link></td>
                  <td className="numeric">{fmt(prediction?.away_score)}</td>
                  <td className="numeric"><strong>{fmt(prediction?.home_score)}</strong></td>
                  <td className="numeric">{prediction?.home_win_probability == null ? "—" : `${fmt(prediction.home_win_probability * 100)}%`}</td>
                  <td>
                    {reliability ? <>
                      <strong>{reliability.side} {fmt(reliability.confidence_lower * 100, 0)}–{fmt(reliability.confidence_upper * 100, 0)}%</strong>
                      <small>{reliability.games.toLocaleString()} held-out games · {reliability.observed == null ? "observed rate unavailable" : `${fmt(reliability.observed * 100, 1)}% observed`}</small>
                    </> : <span className="note">Unavailable</span>}
                  </td>
                  <td className="numeric">{fmt(prediction?.home_margin)}</td>
                  <td className="numeric">{fmt(prediction?.total)}</td>
                  <td>
                    <strong>Primary</strong>
                    <small>{prediction?.margin_low == null || prediction.margin_high == null ? "Range unavailable" : `Range ${fmt(prediction.margin_low)} to ${fmt(prediction.margin_high)}`}</small>
                    {prediction && (() => {
                      const factors = !liveModelId || prediction.model_id === model.id
                        ? footballModelFactors(model, game)
                        : null;
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
      <p className="note" style={{ marginTop: 12 }}>Scores, win probability, margin, total and the calibrated range come from the registered Silvermine model edition. Held-out context reports the historical outcome rate for the probability band containing this estimate; it is not a game-specific confidence guarantee. Open the desk below to filter the full slate and compare qualifying market observations.</p>
      <p className="note" role="status">{liveGames && liveModelId ? `Live forecast edition ${liveModelId} is connected to this preview.` : liveGames ? "Live forecast rows are connected; model edition identity is unavailable." : "Checking the latest live forecast edition; the published page edition remains visible until it responds."}</p>
      {(!liveModelId || liveModelId === model.id) && footballCalibrationSummary(model.calibration) && <p className="note" style={{ marginTop: 8 }}>{footballCalibrationSummary(model.calibration)}</p>}
    </section>
  );
}
