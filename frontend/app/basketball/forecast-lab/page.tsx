import { Suspense } from "react";
import Link from "next/link";
import { getBasketball, getBasketballMarketComparisons, getRosterModel } from "../../_lib/basketball-data";
import ForecastLab from "./ForecastLab";

export const metadata = {
  title: "Basketball forecast lab: model and roster scenarios",
  description: "Compare 2026–27 college basketball forecasts with roster-continuity scenarios, uncertainty and verified market observations.",
};

export default function Page() {
  const overview = getBasketball();
  return <>
    <div className="page-title">
      <div className="eyebrow">Forecast lab / 2026–27</div>
      <h1>See where the<br /><em>models disagree.</em></h1>
      <p>Rank the upcoming slate by roster-scenario movement, primary confidence or uncertainty. Every estimate stays tied to its model edition, training cutoff and source trail.</p>
      <div className="hero-actions"><Link className="button" href="/basketball/matchups/">Open full matchup slate ↗</Link><Link className="hero-link" href="/research/scorecard/?sport=basketball">Open forecast record →</Link><a className="hero-link" href="/api/basketball/research/forecasts?season=2027">Download forecast JSON ↗</a></div>
    </div>
    <Suspense fallback={<p>Loading forecast lab…</p>}>
      <ForecastLab overview={overview} scenarios={getRosterModel().scenarios} markets={getBasketballMarketComparisons()} />
    </Suspense>
  </>;
}
