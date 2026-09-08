import { Suspense } from "react";
import { getFootballEfficiencyModel, getOverview } from "../../_lib/data";
import MatchupBrowser from "./MatchupBrowser";
export const metadata = { title: "2026 football matchups and forecasts" };
export default function Page() {
  const d = getOverview();
  const efficiencyModel = getFootballEfficiencyModel();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The next possession starts here</div>
        <h1>The matchup desk.</h1>
        <p>
          Every published upcoming game involving an FBS team. Forecasts cover
          known FBS opponents, with score estimates and an 80% margin range. All
          times Eastern; schedules can change.
        </p>
      </div>
      <Suspense fallback={<p>Loading matchups…</p>}>
        <MatchupBrowser games={d.upcoming} generated={d.generated_at} efficiencyScenarios={efficiencyModel.scenarios} />
      </Suspense>
    </>
  );
}
