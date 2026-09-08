import { Suspense } from "react";
import { getBasketball, getRosters } from "../../_lib/basketball-data";
import Matchups from "../matchups/Matchups";

export const metadata = {
  title: "College basketball games",
  description:
    "Search published college basketball games and compare forecasts, pace and uncertainty.",
  alternates: { canonical: "/basketball/matchups/" },
};

export default function Page() {
  const basketball = getBasketball();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The archived game index / 2026–27</div>
        <h1>Every game is a preparation note.</h1>
        <p>
          The former game directory now uses the native matchup desk for the
          published schedule and forecast context.
        </p>
      </div>
      <Suspense fallback={<p>Loading slate…</p>}>
        <Matchups
          games={basketball.upcoming}
          rosterSummaries={getRosters().team_summaries || []}
          model={basketball.model}
          generatedAt={basketball.generated_at}
        />
      </Suspense>
    </>
  );
}
