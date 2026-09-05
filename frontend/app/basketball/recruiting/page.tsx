import Recruiting from "./Recruiting";
export const metadata = {
  title: "Basketball roster changes and recruiting research",
};
export default function Page() {
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">
          Roster construction / Evidence before assumptions
        </div>
        <h1>
          Track the people.
          <br />
          Question the listing.
        </h1>
        <p>
          Compare stable player IDs across recorded game appearances and source
          roster listings. The 2025–26 view identifies historical program
          changes in game records. The 2026–27 view is an unconfirmed, partial
          listing—not proof of a transfer, return, eligibility or recruiting
          availability.
        </p>
      </div>
      <Recruiting />
    </>
  );
}
