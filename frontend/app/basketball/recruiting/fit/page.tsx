import Link from "next/link";
import { getBasketball } from "../../../_lib/basketball-data";
import RecruitingFit from "./RecruitingFit";

export const metadata = {
  title: "Basketball recruiting fit board",
  description: "Compare source-listed roster roles with prior production and build a defensible recruiting shortlist for any Division I program.",
  alternates: { canonical: "/basketball/recruiting/fit/" },
};

export default function Page() {
  const teams = getBasketball().ratings.map((team) => ({ id: team.id, name: team.name, rank: team.rank, adj_net: team.adj_net }));
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
