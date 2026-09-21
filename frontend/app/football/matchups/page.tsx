import { Suspense } from "react";
import { getFootballEfficiencyModel, getFootballPersonnelReadiness, getOverview } from "../../_lib/data";
import { getFootballBriefEvidence } from "../../_lib/football-brief-data";
import { footballSlateIntel } from "../../_lib/football-brief";
import MatchupBrowser from "./MatchupBrowser";
import LowerDivisionResults from "./LowerDivisionResults";
import ForecastPreview from "./ForecastPreview";
export const metadata = { title: "2026 football matchups and forecasts" };
export default function Page() {
  const d = getOverview();
  const efficiencyModel = getFootballEfficiencyModel();
  const personnelReadiness = getFootballPersonnelReadiness(d.season);
  const matchupIntel = footballSlateIntel(
    d.upcoming.map((game) => getFootballBriefEvidence(game)),
  );
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The next possession starts here</div>
        <h1>The matchup desk.</h1>
        <p>
          Every published upcoming game in the retained FBS, FCS, Division II
          and Division III schedule. Forecasts cover known FBS opponents and
          validated exact-division D2/D3 games, with score estimates and an 80%
          margin range; rows without a validated model remain visible. All times Eastern; schedules
          can change.
        </p>
      </div>
      <ForecastPreview games={d.upcoming} model={d.model} />
      <Suspense fallback={<p>Loading matchups…</p>}>
        <MatchupBrowser
          games={d.upcoming}
          generated={d.generated_at}
          efficiencyScenarios={efficiencyModel.scenarios}
          personnelReadinessGames={personnelReadiness.games}
          matchupIntel={matchupIntel}
          modelId={d.model.id}
          model={d.model}
          marketCoverage={{
            market_observations: d.coverage.market_observations,
            pregame_market_observations: d.coverage.pregame_market_observations,
          }}
        />
      </Suspense>
      <LowerDivisionResults />
    </>
  );
}
