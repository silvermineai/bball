import NCAAIndividual from "./NCAAIndividual";
import { Suspense } from "react";

export const metadata = { title: "NCAA national basketball player leaders" };

export default function Page() {
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">NCAA Statistics / 2025–26 final rankings</div>
        <h1>Every national leaderboard in one place.</h1>
        <p>
          Browse the NCAA’s published men’s basketball individual leaderboards
          across Divisions I, II and III. Search a player, compare programs and
          switch from rates to published totals for scoring, rebounding,
          shooting, minutes and defensive events while keeping the source
          identity intact.
        </p>
      </div>
      <Suspense fallback={<p role="status">Loading NCAA national records…</p>}>
        <NCAAIndividual />
      </Suspense>
      <p className="note">
        Source snapshots were collected with a rate-limited fetcher that checks
        robots.txt and stores only the structured derivative. NCAA IDs are kept
        separate from ESPN and SportsDataverse identities; no name-only join is
        performed. Publisher rank is shown only when the source supplies it;
        “Search archive by name” is a research lead only: verify the
        program, season and source identity before treating records as the same
        player. <a href="https://stats.ncaa.org/rankings/national_ranking">NCAA Statistics ↗</a>
      </p>
    </>
  );
}
