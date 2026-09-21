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

// Football lower-division schedules and the observed player archive are
// retained as exact-scope desks. Other lower-division football surfaces remain
// fail-closed until their corresponding releases are published.
const FOOTBALL_DIVISION_ARCHIVES = [
  "/football/matchups",
  "/football/players",
];

/**
 * The women's division desk is the only route whose children are allowed to
 * resolve the women's D2/D3 scope themselves. Every other route stays behind
 * ScopeUnavailable, where the lower-division readiness ledger is rendered.
 * Keeping this check in one place prevents a new production route from
 * accidentally becoming a lower-division data escape hatch.
 */
export function isWomensDivisionDesk(pathname: string) {
  return pathname === "/basketball/wbb-readiness" || pathname.startsWith("/basketball/wbb-readiness/");
}

/** Women’s D1 rankings have a source-native player board of their own. */
export function isWomensPlayerRankingDesk(pathname: string) {
  return pathname === "/basketball/ncaa-rankings" || pathname.startsWith("/basketball/ncaa-rankings/");
}

export function isPublishedBoundary(sport: Props["sport"], scope: SportScope, pathname: string) {
  // The women's Division tab is itself the published scope desk. Let its
  // router render the requested D1/D2/D3 readiness surface instead of
  // replacing it with the generic unavailable snapshot.
  if (sport === "basketball" && scope.gender === "women" && isWomensDivisionDesk(pathname)) {
    return false;
  }
  // Keep the source-native women’s D1 player board on its own route. The page
  // component renders only the women’s release after it resolves the URL;
  // this prevents the generic unavailable shell from hiding a valid edition.
  if (sport === "basketball" && scope.gender === "women" && scope.division === "1" && isWomensPlayerRankingDesk(pathname)) {
    return false;
  }
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
  explicitScope = true,
): ScopeBoundaryView {
  // The site is statically exported, so the server cannot see query
  // parameters. Rendering children before hydration would put men's D1 rows
  // into the initial HTML for a women’s D2/D3 URL, even though the client
  // would replace them moments later. Hold every scope behind the shell until
  // the browser has resolved the URL; data integrity is more important than
  // capturing an unqualified route's page body in the static response.
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

  const requestedGender = searchParams.get("gender");
  const requestedDivision = searchParams.get("division");
  const explicitScope = requestedGender === "men"
    || requestedGender === "women"
    || requestedDivision === "2"
    || requestedDivision === "3";
  const view = scopeBoundaryView(hydrated, sport, scope, pathname, explicitScope);
  if (view === "loading") return <div className="scope-loading" aria-busy="true" />;
  return view === "unavailable" ? <ScopeUnavailable sport={sport} scope={scope} /> : children;
}
