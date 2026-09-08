import { Suspense } from "react";
import { getBasketball, getRosterModel, getRosters } from "../../_lib/basketball-data";
import { getScoutIndex } from "../../_lib/scouting-data";
import { buildRosterSummary } from "../../_lib/roster-intel";
import Compare from "../compare/Compare";

export const metadata = {
  title: "Basketball game plan workbench",
  description:
    "Build a coach-facing college basketball matchup plan from the published model, Four Factors and source-listed roster context.",
  alternates: { canonical: "/basketball/gameplan/" },
};

export default function Page() {
  const scouting = getScoutIndex();
  const basketball = getBasketball();
  const rosterModel = getRosterModel();
  const rosters = buildRosterSummary(getRosters().players);
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The coach&apos;s desk / 2026–27 preparation</div>
        <h1>
          Build the plan.
          <br />
          <em>Show the work.</em>
        </h1>
        <p>
          Choose two programs, set the floor and inspect the model terms,
          historical splits and source-listed roster workload behind the
          matchup. A scenario estimate is labeled separately from a scheduled
          forecast.
        </p>
      </div>
      <Suspense fallback={<p>Loading the game-plan workbench…</p>}>
        <Compare
          teams={scouting.teams.map((team) => ({ id: team.id, name: team.name }))}
          model={{
            id: basketball.model.id,
            cutoff: basketball.model.cutoff,
            teams: basketball.model.teams,
            efficiency: basketball.model.efficiency,
            tempo: basketball.model.tempo,
            calibration: basketball.model.calibration,
          }}
          rosters={rosters}
          rosterModel={rosterModel}
        />
      </Suspense>
    </>
  );
}
