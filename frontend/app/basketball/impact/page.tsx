import Impact from "./Impact";
export const metadata = { title: "NCAA basketball player impact rankings" };
export default function Page() {
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Player impact / 2025–26 NCAA data</div>
        <h1>Beyond the box score.</h1>
        <p>
          League-wide regularized adjusted plus-minus (RAPM) from
          SportsDataverse’s NCAA-derived lineup data. The publisher fits a ridge
          model across Division I stints to estimate player contributions with
          teammate and opponent context. These estimates are retrospective
          impact measures, not recruiting grades.
        </p>
      </div>
      <Impact />
      <p className="note">
        Net RAPM is the publisher’s ORAPM + DRAPM. The displayed rank requires
        500 offensive and 500 defensive possessions. The source uses NCAA player
        IDs; these records are not joined to ESPN identities by name alone.{" "}
        <a href="https://github.com/sportsdataverse/hoopR/blob/main/R/load_ncaa_mbb.R">
          Publisher documentation ↗
        </a>
      </p>
    </>
  );
}
