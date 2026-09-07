import { getScoutIndex } from "../../_lib/scouting-data";
import { getRosters } from "../../_lib/basketball-data";
import Programs from "./Programs";
export const metadata = {
  title: "College basketball program scouting library",
  description:
    "Explore offensive and defensive Four Factors, shooting profiles, player workloads and game-by-game efficiency across 366 college basketball programs.",
};
export default function Page() {
  const data = getScoutIndex();
  const rosters = getRosters();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">
          The scouting library / {data.season - 1}–
          {String(data.season).slice(-2)}
        </div>
        <h1>
          Know the program.
          <br />
          <em>Study the details.</em>
        </h1>
        <p>
          Open a program’s scouting book: both ends of the floor, the players
          behind the production, and the games that shaped its season.
        </p>
      </div>
      <Programs teams={data.teams} rosters={rosters} />
      <p className="note">
        The library covers the {data.teams.length} programs in the independent
        model’s rated field. It is not a verified complete Division I membership
        list. Ratings use the published 2026–27 preseason model; records and
        descriptive statistics are from 2025–26. Roster observations are
        source-listed for 2026–27 and are not confirmed depth charts.
      </p>
    </>
  );
}
