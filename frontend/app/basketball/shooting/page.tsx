import fs from "node:fs";
import path from "node:path";
import { Suspense } from "react";
import Link from "next/link";
import { date, fmt } from "../../_lib/format";
import type { ShotCatalog } from "../../_lib/shooting";
import Shooting from "./Shooting";
import { getScoutIndex } from "../../_lib/scouting-data";
export const metadata = {
  title: "Basketball shooting lab: player shot charts and shot selection",
  description:
    "Explore college basketball shot types, court locations and box-score reconciliation for players and programs.",
  alternates: { canonical: "/basketball/shooting/" },
};
export default function Page() {
  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/basketball/shooting.json"),
      "utf8",
    ),
  ) as ShotCatalog;
  const c = catalog.coverage;
  return (
    <>
      <div className="dateline eyebrow">
        <span>
          Play-by-play research / {catalog.season - 1}–
          {String(catalog.season).slice(-2)}
        </span>
        <span>Retrieved {date(catalog.source.fetched_at)}</span>
      </div>
      <div className="page-title">
        <div className="eyebrow">The shooting lab</div>
        <h1>
          Every look.
          <br />
          <em>A little more context.</em>
        </h1>
        <p>
          Inspect a program’s shot selection or an individual player’s attempts.
          Start with box-score-matched games, then examine the gaps in the
          evidence.
        </p>
      </div>
      <div className="strip">
        <div>
          <strong>{fmt(c.field_goal_attempts as number, 0)}</strong>
          <span>Recorded field-goal attempts</span>
        </div>
        <div>
          <strong>{fmt(c.shot_games as number, 0)}</strong>
          <span>Games with shot evidence</span>
        </div>
        <div>
          <strong>{fmt(c.players as number, 0)}</strong>
          <span>Source player identities</span>
        </div>
        <div>
          <strong>
            {fmt(c.matched_team_games as number, 0)} /{" "}
            {fmt(c.team_games as number, 0)}
          </strong>
          <span>Team-game samples matching box totals</span>
        </div>
      </div>
      <Suspense fallback={<p>Loading the shooting lab…</p>}>
        <Shooting
          catalog={catalog}
          ratedTeamIds={getScoutIndex().teams.map((t) => t.id)}
        />
      </Suspense>
      <section className="section paper-panel">
        <h2>The evidence behind the dots.</h2>
        <p>
          These are recorded field-goal attempts, not tracking data. Coordinates
          come from the source and may be approximate. Missing, placeholder,
          out-of-bounds and contradictory positions are excluded from the map
          while the attempts remain in shooting percentages. Long shots beyond
          half court also remain in the totals.
        </p>
        <p>
          The default sample requires exact agreement with team FGA, FGM, 3PA
          and 3PM. Player samples must additionally match that player’s four
          box-score totals in the same game. Matching totals is a consistency
          check; it cannot prove that every event or location is correct.
          Unmatched games and players without an identity remain accounted for
          in coverage.
        </p>
        <p>
          Shot types follow the publisher’s event labels. A layup is not a
          measured rim-distance bin. Field-goal points per attempt excludes free
          throws and is not offensive efficiency per possession. Split selection
          does not alter preseason forecasts. These historical affiliations do
          not establish a current roster.
        </p>
        <p>
          {fmt(c.source_events as number, 0)} total source events across{" "}
          {fmt(c.source_games as number, 0)} games;{" "}
          {fmt(c.schedule_completed_games as number, 0)} completed games in the
          corresponding schedule.{" "}
          {fmt(c.unresolved_player_attempts as number, 0)} accepted attempts
          lack a player ID; {fmt(c.unresolved_team_or_event as number, 0)}{" "}
          potential attempts lack a valid team or event identity and are
          excluded. Counts cover all observed opponents, including programs
          outside the 366-team rating field.
        </p>
        <p>
          Source:{" "}
          <a href={catalog.source.url}>
            SportsDataverse’s bulk play-by-play release
          </a>
          , CC BY 4.0. Normalization, coordinate checks and reconciliation by
          Silvermine.{" "}
          <a href="https://github.com/sportsdataverse/hoopR/blob/main/R/espn_mbb_data.R">
            Publisher coordinate transformation
          </a>
          . <Link href="/basketball/model/">Model and source notebook →</Link>
        </p>
        <details>
          <summary>Source receipt and calculation limits</summary>
          <p className="source-hash">SHA-256: {catalog.source.sha256}</p>
          <p>
            Basket-relative coordinates use the publisher’s origin (25, 0).
            Coordinate checks remove basket-center/default positions, values
            outside the court, three-point locations within 20 feet, at-basket
            shot types over 10 feet, and locations differing from a stated shot
            distance by more than four feet. These conservative checks do not
            correct or impute locations. Attempt values of zero are recovered
            only when the explicit source score-value field is two or three;
            that field describes attempt value even on misses.
          </p>
        </details>
      </section>
    </>
  );
}
