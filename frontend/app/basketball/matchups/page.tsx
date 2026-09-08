import { Suspense } from "react";
import Link from "next/link";
import { getBasketball, getBasketballMarketComparisons, getRosterModel, getRosters } from "../../_lib/basketball-data";
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
          uncertainty. Primary forecasts use historical efficiency, calibrated
          on a separate season. Games outside that trained field carry a
          separately calibrated cold-start estimate so the whole published
          schedule remains useful; those cards are labeled clearly. The desk
          also shows observed prior-minute coverage for roster context.
        </p>
        <p className="note">
          Use the triage controls to surface the strongest model signals, the
          closest projected games or the widest uncertainty ranges. “Toss-up,”
          “Lean” and “Strong lean” describe estimated win-probability confidence;
          they are not betting advice.
        </p>
        <p className="note">
          For a program-wide personnel view, compare the <Link href="/basketball/roster-lab/">roster workload lab</Link> before opening an individual brief.
        </p>
      </div>
      <Suspense fallback={<p>Loading slate…</p>}>
        <Matchups games={d.upcoming} marketComparisons={getBasketballMarketComparisons()} rosterSummaries={rosters.team_summaries || []} rosterScenarios={getRosterModel().scenarios} model={d.model} generatedAt={d.generated_at} />
      </Suspense>
    </>
  );
}
