import { getRosters } from "../../_lib/basketball-data";
import RosterBoard from "./RosterBoard";

export const metadata = {
  title: "2026–27 college basketball roster workload board",
  description:
    "Rank source-listed 2026–27 college basketball players by prior recorded workload and production, with recruiting context and source links.",
  alternates: { canonical: "/basketball/roster-board/" },
};

export default function Page() {
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Roster research / 2026–27 source listings</div>
        <h1>
          Rank the workload.
          <br />
          <em>Keep the context.</em>
        </h1>
        <p>
          Start with the players currently listed in the source roster release,
          then sort the prior recorded season by minutes, scoring, playmaking or
          shooting efficiency. This is a descriptive recruiting board: it does
          not project a new-school role, verify eligibility or treat an absent
          player as a departure.
        </p>
      </div>
      <RosterBoard data={getRosters()} />
    </>
  );
}
