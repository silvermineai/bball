import NcaaTeamBox from "./NcaaTeamBox";

export const metadata = {
  title: "NCAA college basketball team box archive",
  description: "Search 17 seasons of NCAA-derived team box scores, efficiency, tempo and Four Factor profiles.",
  alternates: { canonical: "/basketball/ncaa-team-box/" },
};

export default function Page() { return <NcaaTeamBox />; }
