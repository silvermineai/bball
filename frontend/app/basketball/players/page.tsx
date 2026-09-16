import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import Players from "./Players";
export const metadata = {
  title: "College basketball player statistics, rankings and impact",
  description:
    "Search historical player production, rank an explainable all-around profile, browse national leaderboards and inspect separate RAPM impact records.",
};
export default function Page() {
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Player production / Historical archive</div>
        <h1>Follow the production.</h1>
        <p>
          Search players across 24 stat seasons, from 2002–03 to 2025–26.
          Compare per-game production, shooting efficiency and workload, then
          open the complete game log. Team labels describe the stat season, not
          current recruiting availability. <Link href="/blog/basketball-player-game-logs/">Read the game-log field guide →</Link>
        </p>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">The player desk / Four ways to read a player</div>
            <h2>Start with the question.</h2>
          </div>
        </div>
        <div className="two-col">
          <Link className="paper-panel" href="/basketball/scouting-board/">
            <div className="eyebrow">Build a board</div>
            <h3>Which production profile fits the lineup?</h3>
            <p>
              Weight scoring, rebounding, passing, events, control and
              efficiency against the full qualified season field.
            </p>
            <span>Open the weighted scouting board →</span>
          </Link>
          <Link className="paper-panel" href="/basketball/ncaa/">
            <div className="eyebrow">National leaderboards</div>
            <h3>Who leads the national stat tables?</h3>
            <p>
              Browse player IDs across Divisions I, II and III,
              with the measure and coverage visible.
            </p>
            <span>Browse national leaderboards →</span>
          </Link>
          <Link className="paper-panel" href="/basketball/impact/">
            <div className="eyebrow">Separate impact model</div>
            <h3>Who changed possessions with context?</h3>
            <p>
              Read RAPM estimates for offensive, defensive and net impact;
              identity keys remain separate from the production archive.
            </p>
            <span>Open RAPM impact rankings →</span>
          </Link>
          <Link className="paper-panel" href="/basketball/recruiting/">
            <div className="eyebrow">Roster context</div>
            <h3>Where has a player been observed?</h3>
            <p>
              Compare source-listed program movement with prior recorded
              workload, keeping eligibility and availability unconfirmed.
            </p>
            <span>Read recruiting evidence →</span>
          </Link>
          <Link className="paper-panel" href="/basketball/source-stats/">
            <div className="eyebrow">Stat archive</div>
            <h3>Which stat field do you want to inspect?</h3>
            <p>
              Search all retained averages, totals and
              miscellaneous fields across the player-season release.
            </p>
            <span>Open the stat browser →</span>
          </Link>
          <Link className="paper-panel" href="/basketball/boutique/">
            <div className="eyebrow">Boutique player value</div>
            <h3>Which players add value in another model?</h3>
            <p>Browse offensive, defensive and total Box Plus/Minus across recent seasons.</p>
            <span>Open player value archive →</span>
          </Link>
        </div>
      </section>
      <Players
        catalog={JSON.parse(
          fs.readFileSync(
            path.join(
              process.cwd(),
              "public/data/basketball/history/index.json",
            ),
            "utf8",
          ),
        )}
      />
    </>
  );
}
