import WithinTeamImpact from "./WithinTeamImpact";

export const metadata = {
  title: "College basketball within-team RAPM archive",
  description: "Compare NCAA-derived within-team adjusted plus-minus across player seasons, teams and possession samples.",
  alternates: { canonical: "/basketball/impact/within-team/" },
};

export default function Page() {
  return <WithinTeamImpact />;
}
