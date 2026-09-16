import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import PbpArchive from "./PbpArchive";
import type { PbpCatalog } from "../../_lib/pbp";
import { date, fmt } from "../../_lib/format";

export const metadata = {
  title: "Basketball play-by-play archive",
  description:
    "Search game-level college basketball play-by-play coverage and inspect possession detail.",
  alternates: { canonical: "/basketball/pbp/" },
};

export default function Page() {
  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/basketball/pbp-catalog.json"),
      "utf8",
    ),
  ) as PbpCatalog;
  const current =
    catalog.seasons.find((season) => season.season === catalog.default_season) ??
    catalog.seasons[0];
  const events = catalog.seasons.reduce(
    (total, season) => total + (season.coverage.pbp_events || 0),
    0,
  );
  const games = catalog.seasons.reduce(
    (total, season) => total + season.games.length,
    0,
  );
  // Keep the initial HTML light; the client fetches the complete game catalog
  // after hydration while the current first page renders immediately.
  const initial = {
    ...catalog,
    seasons: catalog.seasons.map((season) => ({
      ...season,
      games:
        season.season === current.season ? season.games.slice(0, 40) : [],
    })),
  };
  return (
    <>
      <div className="dateline eyebrow">
        <span>Evidence archive / play by play</span>
        <span>
          {catalog.seasons.length} seasons · refreshed {date(current.generated_at)}
        </span>
      </div>
      <div className="page-title">
        <div className="eyebrow">The play-by-play archive</div>
        <h1>
          Read the game
          <br />
          <em>one event at a time.</em>
        </h1>
        <p>
          Search the game-level index of retained play-by-play editions. Use it to
          inspect event counts, shot attempts and possession detail.
        </p>
      </div>
      <div className="strip">
        <div><strong>{fmt(events, 0)}</strong><span>Play events indexed</span></div>
        <div><strong>{fmt(games, 0)}</strong><span>Game records</span></div>
        <div><strong>{catalog.seasons.length}</strong><span>Published seasons</span></div>
        <div><strong>{fmt(current.coverage.field_goal_attempts, 0)}</strong><span>Current shot attempts checked</span></div>
      </div>
      <PbpArchive catalogUrl="/data/basketball/pbp-catalog.json" initial={initial} />
      <section className="section paper-panel">
        <h2>What this index proves.</h2>
        <p>
          The counts are recorded events grouped by game ID. They
          are not a claim that every event has a player identity or a valid court
          coordinate. Shot attempts are separately reconciled against imported
          team and player box totals in the <Link href="/basketball/shooting/">shooting lab</Link>.
        </p>
        <p>
          The archive keeps event IDs and retrieval receipts. A future game will not
          have an event record until an edition includes one. Silvermine does not
          scrape around access controls or infer missing actions.
        </p>
        <p>
          The retained parquet can be downloaded from the archive toolbar with
          its immutable hash and receipt preserved by Silvermine.{' '}
          <Link href="/basketball/model/">Read the model notebook →</Link>        </p>
      </section>
    </>
  );
}
