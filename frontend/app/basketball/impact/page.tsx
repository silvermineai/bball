import Impact from "./Impact";
export const metadata = { title: "College basketball player impact rankings" };
export default function Page() {
  return (
    <>
      <div className="page-title">
          <div className="eyebrow">Player impact / historical college data</div>
        <h1>Beyond the box score.</h1>
        <p>
          League-wide regularized adjusted plus-minus (RAPM), with a season
          selector spanning the permitted 2011–12 through 2025–26 editions.
          The ridge model estimates player contributions with teammate and
          opponent context. These estimates are retrospective impact measures,
          not recruiting grades.
        </p>
      </div>
      <Impact />
      <p className="note">
        Net RAPM is ORAPM + DRAPM. The displayed rank requires 500 offensive
        and 500 defensive possessions. Archive IDs remain separate from
        player identities until an audited crosswalk exists.
      </p>
    </>
  );
}
