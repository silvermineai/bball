import fs from "node:fs";
import Link from "next/link";
import path from "node:path";
import EfficiencyDesk from "./EfficiencyDesk";
import type { EfficiencyIndex } from "../../_lib/football-efficiency";
export const metadata = {
  title: "Football team efficiency and matchup comparisons",
  description:
    "Compare offensive EPA, opponent production, explosive plays and short-yardage conversion with game-by-game source evidence.",
  alternates: { canonical: "/football/efficiency/" },
};
export default function Page() {
  const data = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/football/efficiency.json"),
      "utf8",
    ),
  ) as EfficiencyIndex;
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The team laboratory / Recorded production</div>
        <h1>
          How they move the ball.
          <br />
          How you stop it.
        </h1>
        <p>
          Place an offense beside the defense it will face. Compare
          play-weighted efficiency, rushing situations and explosive-play
          counts, then trace the numbers back to individual games. Explore{" "}
          {data.seasons.length} source seasons, from{" "}
          {Math.min(...data.seasons.map((s) => s.season))} through partial 2026.
        </p>
      </div>
      <p className="note">
        <Link className="hero-link" href="/football/features/">
          Test whether these statistics improve forecasts →
        </Link>
      </p>
      <EfficiencyDesk data={data} />
    </>
  );
}
