import { Suspense } from "react";
import { getBasketball } from "../../_lib/basketball-data";
import Matchups from "./Matchups";
export const metadata = {
  title: "2026–27 college basketball matchup predictions",
};
export default function Page() {
  const d = getBasketball();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The schedule / 2026–27</div>
        <h1>Prepare for what’s next.</h1>
        <p>
          Search the published slate and compare score estimates, pace and
          uncertainty. These forecasts use historical efficiency, calibrated on
          a separate season. Injuries, transfers and current roster composition
          are not yet model inputs.
        </p>
      </div>
      <Suspense fallback={<p>Loading slate…</p>}>
        <Matchups games={d.upcoming} />
      </Suspense>
    </>
  );
}
