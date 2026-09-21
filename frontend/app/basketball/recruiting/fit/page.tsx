import Link from "next/link";
import { getArchivedRecruitingOutlook, getBasketball } from "../../../_lib/basketball-data";
import RecruitingFit from "./RecruitingFit";

export const metadata = {
  title: "Basketball recruiting fit board",
  description: "Compare source-listed roster roles with prior production and build a defensible recruiting shortlist for any Division I program.",
  alternates: { canonical: "/basketball/recruiting/fit/" },
};

export default function Page() {
  const basketball = getBasketball();
  // The prior-season outlook is deliberately kept separate from the live
  // roster release so its date boundary remains visible in the fit board.
  const archived = getArchivedRecruitingOutlook();
  const archivedById = new Map((archived?.teams || []).map((team) => [team.id, team]));
  const teams = basketball.ratings.map((team) => {
    const outlook = archivedById.get(team.id);
    return {
      id: team.id,
      name: team.name,
      rank: team.rank,
      adj_net: team.adj_net,
      archivedNeeds: outlook?.positionalNeeds,
      archivedNeedsSeason: outlook ? archived!.season : null,
    };
  });
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Recruiting construction / source-listed 2026–27 roster</div>
        <h1>Find the role<br /><em>before the name.</em></h1>
        <p>
          Choose a program, identify the role you are trying to replace or deepen,
          and rank source-listed players by prior production. Every score is a
          transparent percentile shortlist, not a transfer claim, eligibility ruling
          or 2026–27 performance projection.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/basketball/recruiting/">Open dated recruiting evidence ↗</Link>
          <Link className="hero-link" href="/basketball/roster-lab/">Read workload continuity →</Link>
        </div>
      </div>
      <RecruitingFit teams={teams} />
    </>
  );
}
