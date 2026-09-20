"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import ScopeUnavailable from "./ScopeUnavailable";
import { parseSportScope, type SportScope } from "../_lib/sport-scope";

type Props = {
  sport: "basketball" | "football";
  children: React.ReactNode;
};

const BASKETBALL_DIVISION_ARCHIVES = [
  "/basketball/ncaa",
  "/basketball/ncaa-rankings",
  "/basketball/ncaa-player-box",
  "/basketball/ncaa-rosters",
  "/basketball/ncaa-team-box",
];

// Football lower-division schedules are retained and filtered by the matchup
// desk. Other lower-division football surfaces remain fail-closed until their
// player/team releases are published.
const FOOTBALL_DIVISION_ARCHIVES = [
  "/football/matchups",
];

export function isPublishedBoundary(sport: Props["sport"], scope: SportScope, pathname: string) {
  if (scope.gender === "women") return true;
  if (sport === "football") {
    if (scope.division === "1") return false;
    return !FOOTBALL_DIVISION_ARCHIVES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }
  if (scope.division === "1") return false;
  return !BASKETBALL_DIVISION_ARCHIVES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export type ScopeBoundaryView = "loading" | "unavailable" | "published";

/**
 * Scope is read from the client URL because this shared boundary is a client
 * component. Keep the default men’s page out of the server response until
 * that scope has been resolved; otherwise a women’s URL briefly receives
 * men’s rows before hydration replaces it.
 */
export function scopeBoundaryView(
  hydrated: boolean,
  sport: Props["sport"],
  scope: SportScope,
  pathname: string,
): ScopeBoundaryView {
  if (!hydrated) return "loading";
  return isPublishedBoundary(sport, scope, pathname) ? "unavailable" : "published";
}

export default function SportScopeBoundary({ sport, children }: Props) {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const scope = parseSportScope({
    gender: searchParams.get("gender") || undefined,
    division: searchParams.get("division") || undefined,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const view = scopeBoundaryView(hydrated, sport, scope, pathname);
  if (view === "loading") return <div className="scope-loading" aria-busy="true" />;
  return view === "unavailable" ? <ScopeUnavailable sport={sport} scope={scope} /> : children;
}
