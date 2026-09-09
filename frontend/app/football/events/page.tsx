import fs from "node:fs";
import path from "node:path";
import { Suspense } from "react";
import Link from "next/link";
import EventBrowser from "./EventBrowser";
import type { EventIndex } from "../../_lib/football-events";
export const metadata = {
  title: "Football defense and special-teams event notebook",
  description:
    "Search name-attributed defensive, kicking, punting and return records with game context, field definitions and source receipts.",
  alternates: { canonical: "/football/events/" },
};
export default function Page() {
  const index: EventIndex = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/football/events.json"),
      "utf8",
    ),
  );
  const records = index.editions.reduce((n, e) => n + e.coverage.records, 0);
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">
          Beyond the offense / Source event notebook
        </div>
        <h1>
          Pressure. Possession.
          <br />
          Field position.
        </h1>
        <p>
          Explore {records.toLocaleString("en-US")} defensive and special-teams
          records across{" "}
          {Array.from(new Set(index.editions.map((e) => e.season))).join(", ")}.
          Find game-level evidence of sacks, turnovers, punts and returns, then
          inspect exactly what the source recorded. Switch to Player leaders to
          group one selected metric by source name and team.
        </p>
      </div>
      <aside className="event-identity">
        <div>
          <span className="eyebrow">Read names with care</span>
          <h2>A record is not a player profile.</h2>
        </div>
        <p>
          These releases contain names, game IDs and team IDs, but no stable
          athlete IDs. We keep each source row separate. Repeated names do not
          establish the same person. The leaders view is a source-name/team
          aggregation for triage, not a verified athlete ranking or complete
          season production claim.{" "}
          <Link href="/football/players/">Browse identified players →</Link>{" "}·{" "}
          <Link href="/football/source-stats/">Search every retained source row →</Link>
        </p>
      </aside>
      <Suspense
        fallback={
          <p className="empty" role="status">
            Loading event filters…
          </p>
        }
      >
        <EventBrowser index={index} />
      </Suspense>
      <section className="section paper-panel">
        <h2>What this notebook can establish.</h2>
        {index.limitations.map((l) => (
          <p key={l}>{l}</p>
        ))}
        <p>
          Use a record to guide film review. Check the full box score before
          concluding a player had no production. Tackles, defensive snaps,
          field-goal makes and complete return opportunities are unavailable in
          these releases.
        </p>
      </section>
    </>
  );
}
