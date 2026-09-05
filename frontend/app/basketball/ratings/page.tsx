import { getBasketball } from "../../_lib/basketball-data";
import Ratings from "./Ratings";
export const metadata = {
  title: "Basketball adjusted efficiency and four factors",
};
export default function Page() {
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">
          Efficiency / Four factors / Schedule strength
        </div>
        <h1>Every possession counts.</h1>
        <p>
          Independent opponent-adjusted offense, defense and tempo, with
          observed 2025–26 four factors. Ratings use a minimum of ten observed
          training-season games per program. Historical performance is a
          baseline for 2026–27, not a roster-adjusted preseason ranking.
        </p>
      </div>
      <Ratings rows={getBasketball().ratings} />
      <p className="note">
        Adj O and Adj D: points per 100 estimated possessions. Lower Adj D and
        turnover rate are better. SOS averages rated opponents’ adjusted net
        strength; “rated opp.” reports that sample. Four factors use pooled
        box-score totals; FT rate is FTA/FGA. These are independent Silvermine
        estimates, not KenPom ratings.
      </p>
    </>
  );
}
