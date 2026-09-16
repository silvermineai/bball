import NcaaTeamBox from "./NcaaTeamBox";

export const metadata = {
  title: "College basketball team box archive",
  description: "Search 17 seasons of team box scores, efficiency, tempo and Four Factor profiles.",
  alternates: { canonical: "/basketball/ncaa-team-box/" },
};

export default function Page() { return <NcaaTeamBox />; }
