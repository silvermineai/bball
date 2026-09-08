import { Suspense } from "react";
import Link from "next/link";
import {
  getBasketball,
  getBasketballMarketComparisons,
  getRosterModel,
  getRosters,
} from "../../_lib/basketball-data";
import Matchups from "../matchups/Matchups";

export const metadata = {
  title: "2026–27 college basketball game briefs",
  description:
    "Browse model-backed 2026–27 men's college basketball matchup briefs, story angles, roster context and source evidence.",
};

export default function Page() {
  const basketball = getBasketball();
  const rosters = getRosters();
  const rosterModel = getRosterModel();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The briefing room / 2026–27</div>
        <h1>Read the game<br /><em>before tip.</em></h1>
        <p>
          Every published primary forecast has a linked matchup brief with the
          score estimate, four-factor explanation, roster workload context and
          source trail. Use this desk to find a game, then open the full
          notebook before writing or preparing a plan.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/basketball/pressroom/">Open story angles ↗</Link>
          <Link className="hero-link" href="/basketball/matchups/">View the full schedule →</Link>
          <Link className="hero-link" href="/research/scorecard/?sport=basketball">Inspect the forecast record →</Link>
        </div>
        <p className="note">
          The desk is a source-linked research aid. Forecasts use historical
          team efficiency and venue; they do not know injuries, eligibility,
          confirmed rotations or bookmaker prices. A missing brief means the
          game has no primary forecast in this edition.
        </p>
      </div>
      <Suspense fallback={<p>Loading game briefs…</p>}>
        <Matchups
          games={basketball.upcoming}
          marketComparisons={getBasketballMarketComparisons()}
          rosterSummaries={rosters.team_summaries || []}
          rosterScenarios={rosterModel.scenarios}
          model={basketball.model}
          generatedAt={basketball.generated_at}
        />
      </Suspense>
    </>
  );
}
