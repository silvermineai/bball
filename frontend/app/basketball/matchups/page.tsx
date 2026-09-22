import { Suspense } from "react";
import { getBasketball, getBasketballMarketComparisons, getRosterModel, getRosters } from "../../_lib/basketball-data";
import Matchups from "./Matchups";
import { readPublishedCalibration } from "../model/ForecastCalibrationTable";
export const metadata = {
  title: "2026–27 college basketball matchup predictions",
};
export default function Page() {
  const d = getBasketball();
  const rosters = getRosters();
  const rosterModel = getRosterModel();
  const calibrationBuckets = readPublishedCalibration(d.model.id);
  const modeledGames = d.coverage.forecast_games + (d.coverage.baseline_estimate_games || 0);
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The schedule / 2026–27</div>
        <h1>Know the game<br /><em>before tip.</em></h1>
        <p>
          One clean slate for upcoming games, model projections and the evidence
          that can explain each matchup. Start with the forecast; open the
          context only when you need the factors, roster workload or team history.
        </p>
        <p className="note">
          Filter by team, month, model signal or uncertainty. Every row keeps its
          model edition, timing clock and missing-data boundaries visible.
        </p>
      </div>
      <section className="paper-panel matchup-overview" aria-labelledby="forecast-board" style={{ marginBottom: 24 }}>
        <div className="section-heading" style={{ marginBottom: 12 }}>
          <div>
            <div className="eyebrow">Silvermine forecast board / 2026–27</div>
            <h2 id="forecast-board">The slate at a glance</h2>
          </div>
          <span className="note">Newest registered edition</span>
        </div>
        <div className="strip matchup-overview-strip">
          <div><strong>{d.coverage.upcoming_games.toLocaleString()}</strong><span>scheduled games</span></div>
          <div><strong>{modeledGames.toLocaleString()}</strong><span>games with an estimate</span></div>
          <div><strong>{d.coverage.forecast_games.toLocaleString()}</strong><span>primary model rows</span></div>
          <div><strong>{(d.model.evaluation.winner_accuracy * 100).toFixed(1)}%</strong><span>held-out winner accuracy</span></div>
        </div>
        <p className="note" style={{ marginTop: 14 }}>Primary estimates use opponent-adjusted efficiency and calibrated uncertainty. Cold-start rows remain labeled and wider; no missing line, roster field or timing observation is filled in by inference.</p>
      </section>
      <Suspense fallback={<p>Loading slate…</p>}>
        <Matchups games={d.upcoming} marketComparisons={getBasketballMarketComparisons()} rosterSummaries={rosters.team_summaries || []} rosterScenarios={rosterModel.scenarios} rosterPrimaryModelId={rosterModel.primary_model_id} teamRatings={Object.fromEntries(d.ratings.map((team) => [team.id, team]))} model={d.model} generatedAt={d.generated_at} calibrationBuckets={calibrationBuckets} />
      </Suspense>
    </>
  );
}
