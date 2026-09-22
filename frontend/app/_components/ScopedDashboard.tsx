"use client";

import { useSearchParams } from "next/navigation";
import ScopeUnavailable from "./ScopeUnavailable";
import { basketballScopeAvailable, footballScopeAvailable, parseSportScopeSearch } from "../_lib/sport-scope";

type Props = {
  sport: "basketball" | "football";
  children: React.ReactNode;
  womenChildren?: React.ReactNode;
};

export default function ScopedDashboard({ sport, children, womenChildren }: Props) {
  // This is intentionally reactive: gender/division links update the query
  // string in place, so a mount-only window.location read would leave the
  // dashboard on its previous scope.
  const searchParams = useSearchParams();
  const scope = parseSportScopeSearch(searchParams.toString());

  const available = sport === "basketball"
    ? basketballScopeAvailable(scope)
    : footballScopeAvailable(scope);

  // Women's basketball has its own source-native D1 edition and forecast.
  // Keep it on the shared sport Overview route so choosing the women's tab
  // never renders the men's dashboard or an unnecessary unavailable shell.
  if (sport === "basketball" && scope.gender === "women" && scope.division === "1" && womenChildren) {
    return womenChildren;
  }

  return !available ? <ScopeUnavailable sport={sport} scope={scope} /> : children;
}
