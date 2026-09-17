import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import PlayerBrowser from "./PlayerBrowser";
import type { PlayerCatalog } from "../../_lib/football-player-history";
export const metadata = {
  title: "College football player statistics and rankings",
};
export default function Page() {
  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/football/player-catalog.json"),
      "utf8",
    ),
  ) as PlayerCatalog;
  // Keep edition clocks and hashes available to the archive without
  // serializing provider URLs into the public page payload.
  const publicCatalog: PlayerCatalog = {
    ...catalog,
    seasons: catalog.seasons.map((season) => ({
      ...season,
      sources: season.sources.map((source) => ({
        dataset: source.dataset,
        season: source.season,
        url: "",
        fetched_at: source.fetched_at,
        sha256: source.sha256,
      })),
    })),
  };
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Player evaluation / Production in context</div>
        <h1>Find the difference-makers.</h1>
        <p>
          Search all players represented in the imported box scores. Compare
          offensive production within a category using total expected points
          added (EPA). These are production rankings, not recruiting grades or
          predictions of transfer availability.
        </p>
      </div>
      <p className="note" style={{ marginBottom: 24 }}>
        Want the full timeline? <Link href="/football/careers/">Search the cross-season player careers index →</Link> to compare identified athletes across the 17-season archive.
      </p>
      <p className="note" style={{ marginBottom: 24 }}>
        Looking for sacks, turnovers, punting or return records? The{" "}
        <Link href="/football/events/">defense and specialist notebook →</Link>{" "}
        exposes additional name-attributed game records that cannot be joined to
        these profiles by athlete ID.
      </p>
      <p className="note" style={{ marginBottom: 24 }}>
        Need a field that is not on the ranking board? <Link href="/football/source-stats/">Search every retained source record →</Link> by dataset, season or literal source text.
      </p>
      <p className="note" style={{ marginBottom: 24 }}>
        Want recorded player totals? <Link href="/football/ncaa-leaders/">Open the player leaders board →</Link> for season-scoped name/team aggregates with raw-row links.
      </p>
      <PlayerBrowser
        catalog={publicCatalog}
      />
    </>
  );
}
