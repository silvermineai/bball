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

  return hydrated && isPublishedBoundary(sport, scope, pathname)
    ? <ScopeUnavailable sport={sport} scope={scope} />
    : children;
}
