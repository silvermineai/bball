import IdentityReview from "./IdentityReview";

export const metadata = {
  title: "Basketball identity review queue",
  description:
    "Inspect retained basketball source rows that lack a stable player, team or contest identifier.",
  alternates: { canonical: "/basketball/identity-review/" },
};

export default function Page() {
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Source integrity / Basketball</div>
        <h1>
          Keep every observation.
          <br />
          Attribute only what the source proves.
        </h1>
        <p>
          Browse bounded slices of source rows withheld from player and team
          joins because a required identifier is missing. The original fields
          stay available for review; no name-only identity is invented.
        </p>
      </div>
      <IdentityReview />
    </>
  );
}
