import { getRosters } from "../../_lib/basketball-data";
import { getScoutIndex } from "../../_lib/scouting-data";
import Programs from "../programs/Programs";

export const metadata = {
  title: "Basketball scouting reports",
  description:
    "Open native scouting dossiers for rated college basketball programs, with Four Factors, player workloads and game context.",
  alternates: { canonical: "/basketball/programs/" },
};

export default function Page() {
  const data = getScoutIndex();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The scouting archive / {data.season - 1}–{String(data.season).slice(-2)}</div>
        <h1>
          Scouting reports.
          <br />
          <em>Start with the details.</em>
        </h1>
        <p>
          Native program dossiers now carry the archived scouting reports,
          Four Factors, personnel workloads and game context.
        </p>
      </div>
      <Programs teams={data.teams} rosters={getRosters()} />
      <p className="note">
        This archive covers the {data.teams.length} programs in the independent
        model field. It is not a complete Division I membership census.
      </p>
    </>
  );
}
