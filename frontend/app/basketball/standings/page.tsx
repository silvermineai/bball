import fs from "node:fs";
import path from "node:path";
import StandingsBrowser, { type StandingTeam } from "./StandingsBrowser";

export const metadata = {
  title: "College basketball standings archive",
  description: "Searchable publisher standings snapshots with overall records, conference records, scoring, defense and point differential across 2002–03 through 2025–26.",
  alternates: { canonical: "/basketball/standings/" },
};

export default function Page() {
  const release = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/basketball/standings.json"), "utf8")) as {
    generated_at: string;
    seasons: { season: number }[];
    teams: StandingTeam[];
  };
  const seasons = release.seasons.map((row) => row.season).sort((a, b) => b - a);
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Team context / historical source archive</div>
        <h1>Standings with<br /><em>the record attached.</em></h1>
        <p>Search the attributed publisher standings snapshots by team or conference. Keep the overall record, conference record, scoring, defense and point differential beside the efficiency and roster context.</p>
      </div>
      <section className="section">
        <div className="section-heading"><div><div className="eyebrow">Historical standings</div><h2>Start with the season you can verify.</h2></div><span className="note">{release.teams.length.toLocaleString()} team-season records</span></div>
        <p className="note">The archive compacts one row per team-season while retaining the supplied labels and display values. A historical record describes that season; it does not establish current eligibility, roster status or a forecast.</p>
        <StandingsBrowser teams={release.teams} seasons={seasons} />
      </section>
      <p className="note">Edition retrieved {new Date(release.generated_at).toLocaleDateString("en-US", { timeZone: "UTC" })}.</p>
    </>
  );
}
