import { Suspense } from "react";
import { getBasketball, getRosters } from "../../_lib/basketball-data";
import Matchups from "./Matchups";
export const metadata = {
  title: "2026–27 college basketball matchup predictions",
};
export default function Page() {
  const d = getBasketball();
  const rosters = getRosters();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The schedule / 2026–27</div>
        <h1>Prepare for what’s next.</h1>
        <p>
          Search the published slate and compare score estimates, pace and
          uncertainty. These forecasts use historical efficiency, calibrated on
          a separate season. The desk also shows observed prior-minute coverage
          for roster context; injuries, eligibility and availability remain
          outside the model.
        </p>
        <p className="note">
          Use the triage controls to surface the strongest model signals, the
          closest projected games or the widest uncertainty ranges. “Toss-up,”
          “Lean” and “Strong lean” describe estimated win-probability confidence;
          they are not betting advice.
        </p>
      </div>
      <Suspense fallback={<p>Loading slate…</p>}>
        <Matchups games={d.upcoming} rosterSummaries={rosters.team_summaries || []} />
      </Suspense>
    </>
  );
}
