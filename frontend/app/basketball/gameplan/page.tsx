import { Suspense } from "react";
import { getBasketball, getRosters } from "../../_lib/basketball-data";
import { getScoutIndex } from "../../_lib/scouting-data";
import Compare from "../compare/Compare";

export const metadata = {
  title: "Basketball game plan workbench",
  alternates: { canonical: "/basketball/gameplan/" },
  description:
    "Build a college basketball game plan from the published efficiency model, historical four factors and roster workload evidence.",
};

export default function Page() {
  const data = getScoutIndex();
  const model = getBasketball().model;
  const rosters = getRosters();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The war room / 2026–27 preparation</div>
        <h1>
          Pick the opponent.
          <br />
          <em>Write the plan.</em>
        </h1>
        <p>
          Start with two programs, set the floor, then turn the forecast and
          historical evidence into questions for your staff and players.
        </p>
      </div>
      <Suspense fallback={<p role="status">Loading the game plan…</p>}>
        <Compare
          teams={data.teams.map((team) => ({ id: team.id, name: team.name }))}
          model={{
            id: model.id,
            cutoff: model.cutoff,
            teams: model.teams,
            efficiency: model.efficiency,
            tempo: model.tempo,
            calibration: model.calibration,
          }}
          rosters={rosters.players}
        />
      </Suspense>
    </>
  );
}
