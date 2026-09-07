import { getRosters } from "../../_lib/basketball-data";
import { getScoutIndex } from "../../_lib/scouting-data";
import Programs from "../programs/Programs";

export const metadata = {
  title: "College basketball teams",
  description:
    "Search the native college basketball program library and open a scouting dossier.",
  alternates: { canonical: "/basketball/programs/" },
};

export default function Page() {
  const data = getScoutIndex();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The archived team index / {data.season - 1}–{String(data.season).slice(-2)}</div>
        <h1>Find the team. Read the book.</h1>
        <p>
          The former team directory now opens the native program library with
          performance, personnel and game context.
        </p>
      </div>
      <Programs teams={data.teams} rosters={getRosters()} />
    </>
  );
}
