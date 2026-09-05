import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import Players from "./Players";
export const metadata = { title: "College basketball player statistics" };
export default function Page() {
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Player production / Historical archive</div>
        <h1>Follow the production.</h1>
        <p>
          Search players across 24 source seasons, from 2002–03 to 2025–26.
          Compare per-game production, shooting efficiency and workload, then
          open the complete game log. Team labels describe the stat season, not
          current recruiting availability.
        </p>
      </div>
      <p className="note">
        <Link className="hero-link" href="/basketball/scouting-board/">
          Combine statistics into a scouting board →
        </Link>
      </p>
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
