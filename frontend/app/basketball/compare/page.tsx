import { Suspense } from "react";
import { getScoutIndex } from "../../_lib/scouting-data";
import { getBasketball, getRosters } from "../../_lib/basketball-data";
import Compare from "./Compare";
export const metadata = {
  title: "Basketball matchup workbench",
  alternates: { canonical: "/basketball/compare/" },
  description:
    "Compare college basketball programs on both ends of the floor and explore home, road and neutral scenarios using the published efficiency model.",
};
export default function Page() {
  const data = getScoutIndex(),
    m = getBasketball().model,
    rosters = getRosters();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">
          The matchup workbench / 2026–27 preparation
        </div>
        <h1>
          Two programs.
          <br />
          <em>A better game plan.</em>
        </h1>
        <p>
          Set the floor, inspect the forecast, and compare the historical
          evidence behind each team’s strengths.
        </p>
      </div>
      <Suspense fallback={<p>Loading the workbench…</p>}>
        <Compare
          teams={data.teams.map((t) => ({ id: t.id, name: t.name }))}
          model={{
            id: m.id,
            cutoff: m.cutoff,
            teams: m.teams,
            efficiency: m.efficiency,
            tempo: m.tempo,
            calibration: m.calibration,
          }}
          rosters={rosters.players}
        />
      </Suspense>
    </>
  );
}
