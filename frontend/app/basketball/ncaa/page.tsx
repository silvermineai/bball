import NCAAIndividual from "./NCAAIndividual";
import { Suspense } from "react";

export const metadata = { title: "National college basketball player leaders" };

export default function Page() {
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">National statistics / 2025–26 final rankings</div>
        <h1>Every national leaderboard in one place.</h1>
        <p>
          Browse published men’s basketball individual leaderboards across
          Divisions I, II and III. Search a player, compare programs and
          switch from rates to published totals for scoring, rebounding,
          shooting, minutes, defensive events, possession context and attempt
          totals while keeping the archive identity intact. When a ranking
          snapshot omits assists per game, the board fills that field from the
          exact-ID player-box archive and labels it as a derived supplement.
        </p>
      </div>
      <Suspense fallback={<p role="status">Loading national records…</p>}>
        <NCAAIndividual />
      </Suspense>
      <p className="note">
        Snapshots are collected with a rate-limited fetcher and stored as a
        structured derivative. Archive IDs stay separate until an audited
        crosswalk exists; no name-only join is performed. A rank appears only
        when the archive supplies it. Search results are research leads, so
        verify the program, season and identity before treating records as the
        same player.
      </p>
    </>
  );
}
